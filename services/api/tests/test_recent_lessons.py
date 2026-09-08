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


def _create_document(admin_client: TestClient, title: str) -> str:
    fake_pdf_bytes = b"%PDF-1.4 fake"
    checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=[]),
    ):
        response = admin_client.post(
            "/v1/documents",
            json={
                "title": title,
                "storage_path": f"{title}.pdf",
                "mime_type": "application/pdf",
                "size_bytes": len(fake_pdf_bytes),
                "checksum": checksum,
            },
        )
    assert response.status_code == 200
    return response.json()["id"]  # type: ignore[no-any-return]


def test_recent_lessons_empty_before_any_view(authed_client: TestClient) -> None:
    response = authed_client.get("/v1/me/recent-lessons")
    assert response.status_code == 200
    assert response.json() == []


def test_viewing_a_document_records_it_as_recent(
    admin_client: TestClient, authenticated_user: AuthenticatedUser
) -> None:
    document_id = _create_document(admin_client, "Lesson 1")

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    view_response = admin_client.get(f"/v1/documents/{document_id}")
    assert view_response.status_code == 200

    recent_response = admin_client.get("/v1/me/recent-lessons")
    assert recent_response.status_code == 200
    body = recent_response.json()
    assert len(body) == 1
    assert body[0]["id"] == document_id
    assert body[0]["title"] == "Lesson 1"
    assert "last_viewed_at" in body[0]


def test_recent_lessons_ordered_most_recent_first(
    admin_client: TestClient, authenticated_user: AuthenticatedUser
) -> None:
    first_id = _create_document(admin_client, "First lesson")
    second_id = _create_document(admin_client, "Second lesson")

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    admin_client.get(f"/v1/documents/{first_id}")
    admin_client.get(f"/v1/documents/{second_id}")

    response = admin_client.get("/v1/me/recent-lessons")
    ids = [lesson["id"] for lesson in response.json()]
    assert ids == [second_id, first_id]


def test_reviewing_a_lesson_moves_it_to_the_top(
    admin_client: TestClient, authenticated_user: AuthenticatedUser
) -> None:
    first_id = _create_document(admin_client, "First lesson")
    second_id = _create_document(admin_client, "Second lesson")

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    admin_client.get(f"/v1/documents/{first_id}")
    admin_client.get(f"/v1/documents/{second_id}")
    admin_client.get(f"/v1/documents/{first_id}")  # re-view — no duplicate row, just moves up

    response = admin_client.get("/v1/me/recent-lessons")
    body = response.json()
    ids = [lesson["id"] for lesson in body]
    assert ids == [first_id, second_id]
    assert len(body) == 2  # still one row per (user, document), not a growing log


def test_recent_lessons_respects_limit(
    admin_client: TestClient, authenticated_user: AuthenticatedUser
) -> None:
    ids = [_create_document(admin_client, f"Lesson {i}") for i in range(3)]

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    for document_id in ids:
        admin_client.get(f"/v1/documents/{document_id}")

    response = admin_client.get("/v1/me/recent-lessons?limit=2")
    assert len(response.json()) == 2


def test_recent_lessons_scoped_per_user(
    admin_client: TestClient, authenticated_user: AuthenticatedUser
) -> None:
    document_id = _create_document(admin_client, "Lesson 1")

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    admin_client.get(f"/v1/documents/{document_id}")

    other_user = AuthenticatedUser(id=UUID(int=2), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    response = admin_client.get("/v1/me/recent-lessons")
    assert response.json() == []


def test_viewing_a_document_auto_creates_profile_if_missing(
    admin_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    """Regression test: recording a lesson view must not assume a `profiles`
    row already exists for the caller — mirrors the same fix already applied
    to annotation creation."""
    document_id = _create_document(admin_client, "Lesson 1")

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    assert db_session.get(Profile, authenticated_user.id) is None

    response = admin_client.get(f"/v1/documents/{document_id}")
    assert response.status_code == 200
    assert db_session.get(Profile, authenticated_user.id) is not None
