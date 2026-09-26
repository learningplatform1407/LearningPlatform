import hashlib
import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.main import app
from app.users.models import AccountSettings, Profile


def _create_document(client: TestClient, admin_user: AuthenticatedUser, db_session: Session) -> str:
    db_session.add(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        fake_pdf_bytes = b"%PDF-1.4 fake"
        checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
        with (
            patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
            patch("app.documents.service.extract_pdf", return_value=[]),
        ):
            response = client.post(
                "/v1/documents",
                json={
                    "title": "Lesson",
                    "storage_path": "lesson.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": len(fake_pdf_bytes),
                    "checksum": checksum,
                },
            )
        assert response.status_code == 200
        return response.json()["id"]  # type: ignore[no-any-return]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_notebook_entries_require_auth(client: TestClient) -> None:
    response = client.get("/v1/notebook-entries")
    assert response.status_code == 401


def test_create_text_entry_auto_creates_profile_if_missing(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    """Regression test: creating a notebook entry must not assume a
    `profiles` row already exists for the caller — a user can hit this
    endpoint before ever calling GET /v1/me, which is what normally creates
    the profile."""
    assert db_session.get(Profile, authenticated_user.id) is None

    response = authed_client.post(
        "/v1/notebook-entries", json={"type": "text", "content": "First thought"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "text"
    assert body["content"] == "First thought"
    assert body["strokes"] is None
    assert db_session.get(Profile, authenticated_user.id) is not None


def test_create_drawing_entry_stores_strokes(authed_client: TestClient) -> None:
    strokes = [
        {
            "color": "#000000",
            "width": 0.01,
            "points": [
                {"x": 0.1, "y": 0.2, "pressure": 0.5},
                {"x": 0.15, "y": 0.25, "pressure": 0.6},
            ],
        }
    ]
    response = authed_client.post(
        "/v1/notebook-entries", json={"type": "drawing", "strokes": strokes}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "drawing"
    assert body["content"] is None
    assert body["strokes"] == strokes


def test_list_entries_ordered_oldest_first(authed_client: TestClient) -> None:
    first = authed_client.post("/v1/notebook-entries", json={"type": "text", "content": "one"})
    second = authed_client.post("/v1/notebook-entries", json={"type": "text", "content": "two"})

    response = authed_client.get("/v1/notebook-entries")
    assert response.status_code == 200
    body = response.json()
    assert [entry["id"] for entry in body] == [first.json()["id"], second.json()["id"]]


def test_list_entries_is_scoped_to_the_calling_user(
    client: TestClient,
    authenticated_user: AuthenticatedUser,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    create_response = client.post("/v1/notebook-entries", json={"type": "text", "content": "mine"})
    assert create_response.status_code == 200
    app.dependency_overrides.pop(get_current_user, None)

    other_user = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    other_list = client.get("/v1/notebook-entries")
    assert other_list.status_code == 200
    assert other_list.json() == []
    app.dependency_overrides.pop(get_current_user, None)

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    own_list = client.get("/v1/notebook-entries")
    assert len(own_list.json()) == 1
    app.dependency_overrides.pop(get_current_user, None)


def test_update_own_text_entry(authed_client: TestClient) -> None:
    create_response = authed_client.post(
        "/v1/notebook-entries", json={"type": "text", "content": "draft"}
    )
    entry_id = create_response.json()["id"]

    update_response = authed_client.put(
        f"/v1/notebook-entries/{entry_id}", json={"content": "final"}
    )
    assert update_response.status_code == 200
    assert update_response.json()["content"] == "final"


def test_update_missing_entry_404s(authed_client: TestClient) -> None:
    response = authed_client.put(f"/v1/notebook-entries/{uuid.uuid4()}", json={"content": "x"})
    assert response.status_code == 404


def test_cannot_update_another_users_entry(
    client: TestClient,
    authenticated_user: AuthenticatedUser,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    create_response = client.post("/v1/notebook-entries", json={"type": "text", "content": "mine"})
    entry_id = create_response.json()["id"]
    app.dependency_overrides.pop(get_current_user, None)

    other_user = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    update_response = client.put(f"/v1/notebook-entries/{entry_id}", json={"content": "hijacked"})
    assert update_response.status_code == 404
    app.dependency_overrides.pop(get_current_user, None)


def test_delete_own_entry(authed_client: TestClient) -> None:
    create_response = authed_client.post(
        "/v1/notebook-entries", json={"type": "text", "content": "temp"}
    )
    entry_id = create_response.json()["id"]

    delete_response = authed_client.delete(f"/v1/notebook-entries/{entry_id}")
    assert delete_response.status_code == 204

    list_response = authed_client.get("/v1/notebook-entries")
    assert list_response.json() == []


def test_cannot_delete_another_users_entry(
    client: TestClient,
    authenticated_user: AuthenticatedUser,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    create_response = client.post("/v1/notebook-entries", json={"type": "text", "content": "mine"})
    entry_id = create_response.json()["id"]
    app.dependency_overrides.pop(get_current_user, None)

    other_user = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    delete_response = client.delete(f"/v1/notebook-entries/{entry_id}")
    assert delete_response.status_code == 404
    app.dependency_overrides.pop(get_current_user, None)


def test_create_entry_with_source_document_records_soft_metadata(
    client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    admin_user = AuthenticatedUser(id=uuid.uuid4(), email="admin@example.com")
    document_id = _create_document(client, admin_user, db_session)

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    response = client.post(
        "/v1/notebook-entries",
        json={"type": "text", "content": "Jotted while reading", "source_document_id": document_id},
    )
    app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json()["source_document_id"] == document_id


def test_create_entry_without_source_document_leaves_it_null(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/notebook-entries", json={"type": "text", "content": "From the main notebook"}
    )
    assert response.status_code == 200
    assert response.json()["source_document_id"] is None
