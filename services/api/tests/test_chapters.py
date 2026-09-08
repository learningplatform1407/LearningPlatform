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


def test_list_chapters_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/chapters")
    assert response.status_code == 401


def test_create_chapter_requires_admin(authed_client: TestClient) -> None:
    response = authed_client.post("/v1/chapters", json={"title": "Intro to Systems"})
    assert response.status_code == 403


def test_create_chapter_as_admin(admin_client: TestClient) -> None:
    response = admin_client.post("/v1/chapters", json={"title": "Intro to Systems"})
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Intro to Systems"
    assert body["order_index"] == 0
    assert body["sub_chapter_count"] == 0


def test_chapters_ordered_by_creation(admin_client: TestClient) -> None:
    admin_client.post("/v1/chapters", json={"title": "Chapter One"})
    admin_client.post("/v1/chapters", json={"title": "Chapter Two"})

    response = admin_client.get("/v1/chapters")
    assert response.status_code == 200
    titles = [chapter["title"] for chapter in response.json()]
    assert titles == ["Chapter One", "Chapter Two"]


def test_chapter_sub_chapter_count_reflects_created_sub_chapters(admin_client: TestClient) -> None:
    chapter_id = admin_client.post("/v1/chapters", json={"title": "Chapter One"}).json()["id"]
    other_chapter_id = admin_client.post("/v1/chapters", json={"title": "Chapter Two"}).json()["id"]
    admin_client.post(f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"})
    admin_client.post(f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub B"})
    admin_client.post(f"/v1/chapters/{other_chapter_id}/sub-chapters", json={"title": "Sub C"})

    response = admin_client.get("/v1/chapters")
    chapter = next(c for c in response.json() if c["id"] == chapter_id)
    assert chapter["sub_chapter_count"] == 2
