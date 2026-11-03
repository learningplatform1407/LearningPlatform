import hashlib
import uuid
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.documents.extraction import ExtractionError
from app.documents.models import Document, LecturePdf
from app.ink.models import LessonPageInk
from app.main import app
from app.users.models import AccountSettings, Profile


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="admin@example.com")


@pytest.fixture
def admin_client(
    client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> TestClient:
    db_session.add(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: admin_user
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def document_id(db_session: Session, admin_user: AuthenticatedUser) -> uuid.UUID:
    # Not gated on the admin_client fixture having run, so this also works
    # in tests that authenticate as a non-admin to assert a 403.
    db_session.merge(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.flush()
    document = Document(title="Test Lecture", created_by=admin_user.id)
    db_session.add(document)
    db_session.commit()
    return document.id


def _upsert_payload(pdf_bytes: bytes = b"%PDF-1.4 fake") -> dict[str, str | int]:
    return {
        "storage_path": "lecture.pdf",
        "mime_type": "application/pdf",
        "size_bytes": len(pdf_bytes),
        "checksum": hashlib.sha256(pdf_bytes).hexdigest(),
    }


def test_upsert_lecture_pdf_requires_admin(
    authed_client: TestClient, document_id: uuid.UUID
) -> None:
    response = authed_client.put(f"/v1/documents/{document_id}/pdf", json=_upsert_payload())
    assert response.status_code == 403


def test_replacing_lecture_pdf_survives_a_failing_storage_delete(
    admin_client: TestClient, document_id: uuid.UUID, db_session: Session
) -> None:
    """Discarding the superseded PDF from Storage must never fail the request.

    `delete_object` raises RuntimeError when Storage is unconfigured and
    httpx ConnectError/ReadTimeout when it's unreachable -- none of which
    subclass StorageError, so the original `suppress(StorageError)` let all
    three escape as a 500 on a replace that had otherwise succeeded. Each
    stand-in below is a type that guard would have missed.
    """
    fake_pdf_bytes = b"%PDF-1.4 fake"
    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.validate_pdf", return_value=3),
    ):
        first = admin_client.put(
            f"/v1/documents/{document_id}/pdf", json=_upsert_payload(fake_pdf_bytes)
        )
    assert first.status_code == 200

    for boom in (RuntimeError("SUPABASE_URL is not configured"), httpx.ConnectError("unreachable")):
        other_bytes = b"%PDF-1.4 another edition"
        with (
            patch("app.documents.service.download_object", return_value=other_bytes),
            patch("app.documents.service.validate_pdf", return_value=5),
            patch("app.documents.service.delete_object", side_effect=boom),
        ):
            response = admin_client.put(
                f"/v1/documents/{document_id}/pdf", json=_upsert_payload(other_bytes)
            )
        assert response.status_code == 200, f"{type(boom).__name__} escaped as {response.text}"
        assert response.json()["status"] == "ready"

    # The replace still happened: one row, pointing at the newest upload.
    assert db_session.query(LecturePdf).count() == 1


def test_upsert_lecture_pdf_validates_and_stores(
    admin_client: TestClient, document_id: uuid.UUID
) -> None:
    fake_pdf_bytes = b"%PDF-1.4 fake"
    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.validate_pdf", return_value=3),
    ):
        response = admin_client.put(
            f"/v1/documents/{document_id}/pdf", json=_upsert_payload(fake_pdf_bytes)
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["storage_path"] == "lecture.pdf"
    # Taken from validate_pdf's return value, patched to 3 above -- that
    # return used to be discarded, leaving nothing to bound page_number by.
    assert body["page_count"] == 3

    detail = admin_client.get(f"/v1/documents/{document_id}")
    assert detail.status_code == 200
    assert detail.json()["lecture_pdf"] == {
        "status": "ready",
        "error_message": None,
        "storage_path": "lecture.pdf",
        "page_count": 3,
    }


def test_document_with_no_lecture_pdf_returns_null(
    admin_client: TestClient, document_id: uuid.UUID
) -> None:
    response = admin_client.get(f"/v1/documents/{document_id}")
    assert response.status_code == 200
    assert response.json()["lecture_pdf"] is None


def test_upsert_lecture_pdf_marks_failed_on_invalid_pdf(
    admin_client: TestClient, document_id: uuid.UUID
) -> None:
    with (
        patch("app.documents.service.download_object", return_value=b"not a pdf"),
        patch(
            "app.documents.service.validate_pdf",
            side_effect=ExtractionError("Could not open PDF"),
        ),
    ):
        response = admin_client.put(
            f"/v1/documents/{document_id}/pdf", json=_upsert_payload(b"not a pdf")
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert "Could not open PDF" in body["error_message"]


def test_replacing_lecture_pdf_wipes_prior_ink_unconditionally(
    admin_client: TestClient,
    admin_user: AuthenticatedUser,
    document_id: uuid.UUID,
    db_session: Session,
) -> None:
    fake_pdf_bytes = b"%PDF-1.4 fake"
    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.validate_pdf", return_value=3),
    ):
        first = admin_client.put(
            f"/v1/documents/{document_id}/pdf", json=_upsert_payload(fake_pdf_bytes)
        )
    assert first.status_code == 200

    # Admin draws ink on page 1 of the first lecture PDF.
    ink_response = admin_client.put(
        f"/v1/documents/{document_id}/pages/1/ink",
        json={"strokes": [{"color": "#000", "width": 0.01, "points": [{"x": 0.1, "y": 0.1}]}]},
    )
    assert ink_response.status_code == 200
    assert len(ink_response.json()["strokes"]) == 1
    assert db_session.query(LessonPageInk).count() == 1

    # Replace the lecture PDF entirely -- no matching, ink is just gone.
    other_pdf_bytes = b"%PDF-1.4 a different book"
    with (
        patch("app.documents.service.download_object", return_value=other_pdf_bytes),
        patch("app.documents.service.validate_pdf", return_value=10),
    ):
        second = admin_client.put(
            f"/v1/documents/{document_id}/pdf", json=_upsert_payload(other_pdf_bytes)
        )
    assert second.status_code == 200

    assert db_session.query(LessonPageInk).count() == 0
    get_ink = admin_client.get(f"/v1/documents/{document_id}/pages/1/ink")
    assert get_ink.status_code == 200
    assert get_ink.json()["strokes"] == []
