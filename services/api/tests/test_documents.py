import hashlib
from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.annotations.models import DocumentAnnotation
from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.cloze.models import ClozeCard
from app.documents.extraction import ExtractionError
from app.documents.models import Document, DocumentVersion
from app.flashcards.constants import FlashcardScope
from app.flashcards.models import Flashcard
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


def test_create_document_uploads_extracted_images_and_stores_only_the_path(
    admin_client: TestClient,
) -> None:
    fake_pdf_bytes = b"%PDF-1.4 fake"
    checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
    fake_blocks = [
        {"type": "heading", "text": "Chapter 1", "page": 1},
        {"type": "image", "page": 1, "image_bytes": b"\x89PNG-fake-bytes", "ext": "png"},
        {"type": "paragraph", "text": "After the image.", "page": 1},
    ]

    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=fake_blocks),
        patch("app.documents.service.upload_object") as mock_upload_object,
    ):
        response = admin_client.post(
            "/v1/documents",
            json={
                "title": "Lecture with a diagram",
                "storage_path": "abc.pdf",
                "mime_type": "application/pdf",
                "size_bytes": len(fake_pdf_bytes),
                "checksum": checksum,
            },
        )

    assert response.status_code == 200
    body = response.json()
    version_id = body["current_version"]["id"]
    stored_blocks = body["current_version"]["extracted_content"]["blocks"]

    assert stored_blocks[0] == {"type": "heading", "text": "Chapter 1", "page": 1}
    assert stored_blocks[2] == {"type": "paragraph", "text": "After the image.", "page": 1}

    image_block = stored_blocks[1]
    assert image_block["type"] == "image"
    assert image_block["page"] == 1
    assert image_block["image_path"] == f"{version_id}/images/1.png"
    assert "image_bytes" not in image_block  # raw bytes never reach the stored JSON

    mock_upload_object.assert_called_once_with(
        f"{version_id}/images/1.png", b"\x89PNG-fake-bytes", "image/png"
    )


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


def _seed_ready_document(
    db_session: Session, created_by: UUID, blocks: list[dict]
) -> tuple[UUID, UUID]:
    """Returns (document_id, version_id) for a document whose current
    version already has `blocks` as its extracted content."""
    document = Document(title="Replaceable Lecture", created_by=created_by)
    db_session.add(document)
    db_session.flush()

    version = DocumentVersion(
        document_id=document.id,
        storage_path="original.pdf",
        mime_type="application/pdf",
        size_bytes=10,
        checksum="orig-checksum",
        status="ready",
        extracted_content={"blocks": blocks},
    )
    db_session.add(version)
    db_session.flush()
    document.current_version_id = version.id
    db_session.commit()
    return document.id, version.id


def _replace_payload(pdf_bytes: bytes) -> dict[str, str | int]:
    return {
        "storage_path": "replacement.pdf",
        "mime_type": "application/pdf",
        "size_bytes": len(pdf_bytes),
        "checksum": hashlib.sha256(pdf_bytes).hexdigest(),
    }


def test_replace_lecture_text_requires_admin(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/documents/00000000-0000-0000-0000-000000000000/replace",
        json=_replace_payload(b"whatever"),
    )
    assert response.status_code == 403


def test_replace_lecture_text_carries_highlight_forward_across_shift(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    old_blocks = [
        {"type": "paragraph", "text": "First paragraph.", "page": 1},
        {"type": "paragraph", "text": "Second paragraph.", "page": 1},
    ]
    document_id, old_version_id = _seed_ready_document(db_session, admin_user.id, old_blocks)

    # A highlight on "First paragraph." (block_index 0).
    db_session.add(
        DocumentAnnotation(
            document_version_id=old_version_id,
            user_id=admin_user.id,
            type="highlight",
            block_index=0,
            start_offset=0,
            end_offset=5,
            color="yellow",
        )
    )
    db_session.commit()

    new_pdf_bytes = b"%PDF-1.4 replacement"
    new_blocks = [
        {"type": "paragraph", "text": "Inserted paragraph.", "page": 1},
        {"type": "paragraph", "text": "First paragraph.", "page": 1},
        {"type": "paragraph", "text": "Second paragraph.", "page": 1},
    ]
    with (
        patch("app.documents.service.download_object", return_value=new_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=new_blocks),
    ):
        response = admin_client.post(
            f"/v1/documents/{document_id}/replace", json=_replace_payload(new_pdf_bytes)
        )
    assert response.status_code == 200
    body = response.json()
    new_version_id = body["current_version"]["id"]
    assert new_version_id != str(old_version_id)
    assert body["current_version"]["extracted_content"]["blocks"] == new_blocks

    annotations = admin_client.get(f"/v1/documents/{document_id}/annotations").json()
    assert len(annotations) == 1
    assert annotations[0]["block_index"] == 1  # shifted from 0 -> 1
    assert annotations[0]["document_version_id"] == new_version_id


def test_replace_lecture_text_drops_annotation_on_changed_block(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    old_blocks = [{"type": "paragraph", "text": "Original wording.", "page": 1}]
    document_id, old_version_id = _seed_ready_document(db_session, admin_user.id, old_blocks)
    db_session.add(
        DocumentAnnotation(
            document_version_id=old_version_id,
            user_id=admin_user.id,
            type="highlight",
            block_index=0,
            start_offset=0,
            end_offset=5,
            color="yellow",
        )
    )
    db_session.commit()

    new_pdf_bytes = b"%PDF-1.4 edited"
    new_blocks = [{"type": "paragraph", "text": "Edited wording.", "page": 1}]
    with (
        patch("app.documents.service.download_object", return_value=new_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=new_blocks),
    ):
        response = admin_client.post(
            f"/v1/documents/{document_id}/replace", json=_replace_payload(new_pdf_bytes)
        )
    assert response.status_code == 200

    annotations = admin_client.get(f"/v1/documents/{document_id}/annotations").json()
    assert annotations == []


def test_replace_lecture_text_drops_annotation_on_image_block(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    old_blocks = [{"type": "image", "page": 1, "image_path": "x/images/1.png"}]
    document_id, old_version_id = _seed_ready_document(db_session, admin_user.id, old_blocks)
    db_session.add(
        DocumentAnnotation(
            document_version_id=old_version_id,
            user_id=admin_user.id,
            type="margin_note",
            block_index=0,
            start_offset=None,
            end_offset=None,
            note_text="a note on the figure",
        )
    )
    db_session.commit()

    new_pdf_bytes = b"%PDF-1.4 same image"
    # Raw extract_pdf shape for an image block (pre-persistence) -- still
    # never matched, by design, even though it's visually unchanged.
    new_raw_blocks = [
        {"type": "image", "page": 1, "image_bytes": b"\x89PNG-fake-bytes", "ext": "png"}
    ]
    with (
        patch("app.documents.service.download_object", return_value=new_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=new_raw_blocks),
        patch("app.documents.service.upload_object"),
    ):
        response = admin_client.post(
            f"/v1/documents/{document_id}/replace", json=_replace_payload(new_pdf_bytes)
        )
    assert response.status_code == 200
    assert admin_client.get(f"/v1/documents/{document_id}/annotations").json() == []


def test_replace_lecture_text_deletes_old_version(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    old_blocks = [{"type": "paragraph", "text": "Hello.", "page": 1}]
    document_id, old_version_id = _seed_ready_document(db_session, admin_user.id, old_blocks)

    new_pdf_bytes = b"%PDF-1.4 new"
    new_blocks = [{"type": "paragraph", "text": "Hello.", "page": 1}]
    with (
        patch("app.documents.service.download_object", return_value=new_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=new_blocks),
        patch("app.documents.service.delete_object") as mock_delete,
    ):
        response = admin_client.post(
            f"/v1/documents/{document_id}/replace", json=_replace_payload(new_pdf_bytes)
        )
    assert response.status_code == 200
    mock_delete.assert_any_call("original.pdf")
    assert db_session.get(DocumentVersion, old_version_id) is None


def test_replace_lecture_text_failed_extraction_leaves_old_version_untouched(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    old_blocks = [{"type": "paragraph", "text": "Hello.", "page": 1}]
    document_id, old_version_id = _seed_ready_document(db_session, admin_user.id, old_blocks)

    with (
        patch("app.documents.service.download_object", return_value=b"bad"),
        patch(
            "app.documents.service.extract_pdf",
            side_effect=ExtractionError("No extractable text found"),
        ),
    ):
        response = admin_client.post(
            f"/v1/documents/{document_id}/replace", json=_replace_payload(b"bad")
        )
    assert response.status_code == 422

    document = db_session.get(Document, document_id)
    assert document is not None
    assert document.current_version_id == old_version_id
    assert db_session.get(DocumentVersion, old_version_id) is not None


def test_replace_lecture_text_leaves_flashcards_and_cloze_cards_untouched(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    old_blocks = [{"type": "paragraph", "text": "Hello world.", "page": 1}]
    document_id, _ = _seed_ready_document(db_session, admin_user.id, old_blocks)

    cloze_card = ClozeCard(
        document_id=document_id,
        block_index=0,
        start_offset=0,
        end_offset=5,
        answer_text="Hello",
    )
    flashcard = Flashcard(
        document_id=document_id,
        scope=FlashcardScope.PERSONAL,
        front_text="Q",
        back_text="A",
        created_by=admin_user.id,
    )
    db_session.add_all([cloze_card, flashcard])
    db_session.commit()
    cloze_card_id, flashcard_id = cloze_card.id, flashcard.id

    new_pdf_bytes = b"%PDF-1.4 totally different content"
    new_blocks = [{"type": "paragraph", "text": "Completely different text.", "page": 1}]
    with (
        patch("app.documents.service.download_object", return_value=new_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=new_blocks),
    ):
        response = admin_client.post(
            f"/v1/documents/{document_id}/replace", json=_replace_payload(new_pdf_bytes)
        )
    assert response.status_code == 200

    # Deliberate: no reset, no regeneration -- these stay exactly as they
    # were, keyed on document_id alone, even though the underlying text the
    # cloze card's offsets referred to no longer exists.
    assert db_session.get(ClozeCard, cloze_card_id) is not None
    assert db_session.get(Flashcard, flashcard_id) is not None
