import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.documents.models import Document, DocumentVersion
from app.main import app
from app.users.models import AccountSettings, Profile


@pytest.fixture
def owner_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="owner@example.com")


@pytest.fixture
def ready_document_id(db_session: Session, owner_user: AuthenticatedUser) -> uuid.UUID:
    """A document with a ready current_version — annotation endpoints don't
    care about extraction, they just need a valid document to anchor to."""
    db_session.add(
        Profile(id=owner_user.id, settings=AccountSettings(user_id=owner_user.id))
    )
    db_session.flush()

    document = Document(title="Test Lecture", created_by=owner_user.id)
    db_session.add(document)
    db_session.flush()

    version = DocumentVersion(
        document_id=document.id,
        storage_path="x.pdf",
        mime_type="application/pdf",
        size_bytes=10,
        checksum="abc",
        status="ready",
        extracted_content={"blocks": [{"type": "paragraph", "text": "Hello world", "page": 1}]},
    )
    db_session.add(version)
    db_session.flush()

    document.current_version_id = version.id
    db_session.commit()
    return document.id


def test_annotations_require_auth(client: TestClient, ready_document_id: uuid.UUID) -> None:
    response = client.get(f"/v1/documents/{ready_document_id}/annotations")
    assert response.status_code == 401


def test_create_highlight_defaults_to_yellow(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = authed_client.post(
        f"/v1/documents/{ready_document_id}/annotations",
        json={"type": "highlight", "block_index": 0, "start_offset": 0, "end_offset": 5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "highlight"
    assert body["color"] == "yellow"
    assert body["start_offset"] == 0
    assert body["end_offset"] == 5


def test_create_margin_note_stores_text(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = authed_client.post(
        f"/v1/documents/{ready_document_id}/annotations",
        json={"type": "margin_note", "block_index": 0, "note_text": "Check this later"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "margin_note"
    assert body["note_text"] == "Check this later"
    assert body["start_offset"] is None
    assert body["color"] is None


def test_create_annotation_auto_creates_profile_if_missing(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    ready_document_id: uuid.UUID,
    db_session: Session,
) -> None:
    """Regression test: creating an annotation must not assume a `profiles`
    row already exists for the caller — a user can hit this endpoint before
    ever calling GET /v1/me, which is what normally creates the profile."""
    assert db_session.get(Profile, authenticated_user.id) is None

    response = authed_client.post(
        f"/v1/documents/{ready_document_id}/annotations",
        json={"type": "highlight", "block_index": 0, "start_offset": 0, "end_offset": 5},
    )
    assert response.status_code == 200
    assert db_session.get(Profile, authenticated_user.id) is not None


def test_create_annotation_for_missing_document_404s(authed_client: TestClient) -> None:
    response = authed_client.post(
        f"/v1/documents/{uuid.uuid4()}/annotations",
        json={"type": "highlight", "block_index": 0},
    )
    assert response.status_code == 404


def test_list_annotations_is_scoped_to_the_calling_user(
    client: TestClient,
    ready_document_id: uuid.UUID,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    create_response = client.post(
        f"/v1/documents/{ready_document_id}/annotations",
        json={"type": "highlight", "block_index": 0, "start_offset": 0, "end_offset": 5},
    )
    assert create_response.status_code == 200
    app.dependency_overrides.pop(get_current_user, None)

    # A different user sees none of the first user's annotations.
    other_user = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    other_list = client.get(f"/v1/documents/{ready_document_id}/annotations")
    assert other_list.status_code == 200
    assert other_list.json() == []
    app.dependency_overrides.pop(get_current_user, None)

    # The original user still sees their own.
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    own_list = client.get(f"/v1/documents/{ready_document_id}/annotations")
    assert len(own_list.json()) == 1
    app.dependency_overrides.pop(get_current_user, None)


def test_delete_own_annotation(authed_client: TestClient, ready_document_id: uuid.UUID) -> None:
    create_response = authed_client.post(
        f"/v1/documents/{ready_document_id}/annotations",
        json={"type": "margin_note", "block_index": 0, "note_text": "temp"},
    )
    annotation_id = create_response.json()["id"]

    delete_response = authed_client.delete(
        f"/v1/documents/{ready_document_id}/annotations/{annotation_id}"
    )
    assert delete_response.status_code == 204

    list_response = authed_client.get(f"/v1/documents/{ready_document_id}/annotations")
    assert list_response.json() == []


def test_cannot_delete_another_users_annotation(
    client: TestClient,
    ready_document_id: uuid.UUID,
    authenticated_user: AuthenticatedUser,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    create_response = client.post(
        f"/v1/documents/{ready_document_id}/annotations",
        json={"type": "margin_note", "block_index": 0, "note_text": "mine"},
    )
    annotation_id = create_response.json()["id"]
    app.dependency_overrides.pop(get_current_user, None)

    other_user = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    delete_response = client.delete(
        f"/v1/documents/{ready_document_id}/annotations/{annotation_id}"
    )
    assert delete_response.status_code == 404
    app.dependency_overrides.pop(get_current_user, None)
