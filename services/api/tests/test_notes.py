import hashlib
from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.main import app
from app.users.models import AccountSettings, Profile


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=UUID(int=1), email="admin@example.com")


@pytest.fixture
def document_id(client: TestClient, admin_user: AuthenticatedUser, db_session: Session) -> str:
    # Deliberately does *not* depend on `admin_client` — that fixture only
    # pops its `get_current_user` override at test teardown, which would
    # leak admin auth into any later request in the same test (including
    # ones made via the plain `client`/`authed_client` fixtures) that's
    # meant to exercise the unauthenticated/non-admin path.
    db_session.add(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.commit()
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: admin_user

    fake_pdf_bytes = b"%PDF-1.4 fake"
    checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=[]),
    ):
        response = client.post(
            "/v1/documents",
            json={
                "title": "Lesson 1",
                "storage_path": "lesson1.pdf",
                "mime_type": "application/pdf",
                "size_bytes": len(fake_pdf_bytes),
                "checksum": checksum,
            },
        )
    if previous_override is not None:
        app.dependency_overrides[get_current_user] = previous_override
    else:
        app.dependency_overrides.pop(get_current_user, None)
    return response.json()["id"]  # type: ignore[no-any-return]


def test_get_note_requires_auth(client: TestClient, document_id: str) -> None:
    response = client.get(f"/v1/documents/{document_id}/notes")
    assert response.status_code == 401


def test_get_note_returns_null_before_any_note_exists(
    authed_client: TestClient, document_id: str
) -> None:
    response = authed_client.get(f"/v1/documents/{document_id}/notes")
    assert response.status_code == 200
    assert response.json() is None


def test_put_note_creates_and_get_returns_it(authed_client: TestClient, document_id: str) -> None:
    put_response = authed_client.put(
        f"/v1/documents/{document_id}/notes", json={"content": "Remember the key formula."}
    )
    assert put_response.status_code == 200
    assert put_response.json()["content"] == "Remember the key formula."

    get_response = authed_client.get(f"/v1/documents/{document_id}/notes")
    assert get_response.status_code == 200
    assert get_response.json()["content"] == "Remember the key formula."


def test_put_note_overwrites_the_same_row(authed_client: TestClient, document_id: str) -> None:
    authed_client.put(f"/v1/documents/{document_id}/notes", json={"content": "First draft."})
    authed_client.put(f"/v1/documents/{document_id}/notes", json={"content": "Revised note."})

    response = authed_client.get(f"/v1/documents/{document_id}/notes")
    assert response.json()["content"] == "Revised note."


def test_notes_are_scoped_per_user(
    client: TestClient, document_id: str, authenticated_user: AuthenticatedUser
) -> None:
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    client.put(f"/v1/documents/{document_id}/notes", json={"content": "My private note."})
    app.dependency_overrides.pop(get_current_user, None)

    other_user = AuthenticatedUser(id=UUID(int=99), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    response = client.get(f"/v1/documents/{document_id}/notes")
    assert response.json() is None
    app.dependency_overrides.pop(get_current_user, None)


def test_put_note_auto_creates_profile_if_missing(
    client: TestClient,
    document_id: str,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    """Regression test: upserting a note must not assume a `profiles` row
    already exists for the caller — mirrors the same fix already applied to
    annotation creation and lesson-view recording."""
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    assert db_session.get(Profile, authenticated_user.id) is None

    response = client.put(f"/v1/documents/{document_id}/notes", json={"content": "First note."})
    assert response.status_code == 200
    assert db_session.get(Profile, authenticated_user.id) is not None
    app.dependency_overrides.pop(get_current_user, None)
