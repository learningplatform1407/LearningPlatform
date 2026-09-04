import hashlib
from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.documents.extraction import ExtractionError
from app.main import app
from app.users.models import AccountSettings, Profile


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=UUID(int=1), email="admin@example.com")


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


def test_documents_list_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/documents")
    assert response.status_code == 401


def test_upload_url_requires_admin(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/documents/upload-url",
        json={"filename": "lecture.pdf", "mime_type": "application/pdf", "size_bytes": 1000},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_create_document_requires_admin(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/documents",
        json={
            "title": "Lecture 1",
            "storage_path": "x.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 1000,
            "checksum": "abc",
        },
    )
    assert response.status_code == 403


def test_upload_url_returns_signed_url_for_admin(admin_client: TestClient) -> None:
    with patch("app.documents.service.create_signed_upload_url", return_value="signed-token"):
        response = admin_client.post(
            "/v1/documents/upload-url",
            json={"filename": "lecture.pdf", "mime_type": "application/pdf", "size_bytes": 1000},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["token"] == "signed-token"
    assert body["storage_path"].endswith(".pdf")


def test_upload_url_rejects_oversized_file(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/v1/documents/upload-url",
        json={
            "filename": "big.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 60 * 1024 * 1024,
        },
    )
    assert response.status_code == 422


def test_create_document_extracts_and_is_listable(
    admin_client: TestClient, authenticated_user: AuthenticatedUser
) -> None:
    fake_pdf_bytes = b"%PDF-1.4 fake"
    checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
    fake_blocks = [{"type": "heading", "text": "Chapter 1", "page": 1}]

    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=fake_blocks),
    ):
        response = admin_client.post(
            "/v1/documents",
            json={
                "title": "Lecture 1",
                "storage_path": "abc.pdf",
                "mime_type": "application/pdf",
                "size_bytes": len(fake_pdf_bytes),
                "checksum": checksum,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Lecture 1"
    assert body["current_version"]["status"] == "ready"
    assert body["current_version"]["extracted_content"] == {"blocks": fake_blocks}
    document_id = body["id"]

    # Switch identity to a plain (non-admin) authenticated user — `admin_client`
    # and `authed_client` share the same app-level dependency override, so they
    # can't be used as two independently-authenticated clients in one test.
    app.dependency_overrides[get_current_user] = lambda: authenticated_user

    list_response = admin_client.get("/v1/documents")
    assert list_response.status_code == 200
    assert any(doc["id"] == document_id for doc in list_response.json())

    detail_response = admin_client.get(f"/v1/documents/{document_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["current_version"]["status"] == "ready"


def test_create_document_marks_failed_on_extraction_error(admin_client: TestClient) -> None:
    with (
        patch("app.documents.service.download_object", return_value=b"whatever"),
        patch(
            "app.documents.service.extract_pdf",
            side_effect=ExtractionError("No extractable text found"),
        ),
    ):
        response = admin_client.post(
            "/v1/documents",
            json={
                "title": "Scanned lecture",
                "storage_path": "scan.pdf",
                "mime_type": "application/pdf",
                "size_bytes": 8,
                "checksum": hashlib.sha256(b"whatever").hexdigest(),
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["current_version"]["status"] == "failed"
    assert "No extractable text" in body["current_version"]["error_message"]


def test_get_document_not_found(authed_client: TestClient) -> None:
    response = authed_client.get("/v1/documents/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
