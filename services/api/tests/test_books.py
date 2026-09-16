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


def test_list_books_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/books")
    assert response.status_code == 401


def test_create_book_requires_admin(authed_client: TestClient) -> None:
    response = authed_client.post("/v1/books", json={"title": "Main Library"})
    assert response.status_code == 403


def test_create_book_as_admin(admin_client: TestClient) -> None:
    response = admin_client.post("/v1/books", json={"title": "Main Library"})
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Main Library"
    assert body["order_index"] == 0
    assert body["chapter_count"] == 0


def test_books_ordered_by_creation(admin_client: TestClient) -> None:
    admin_client.post("/v1/books", json={"title": "Book One"})
    admin_client.post("/v1/books", json={"title": "Book Two"})

    response = admin_client.get("/v1/books")
    assert response.status_code == 200
    titles = [book["title"] for book in response.json()]
    assert titles == ["Book One", "Book Two"]


def test_book_chapter_count_reflects_created_chapters(admin_client: TestClient) -> None:
    book_id = admin_client.post("/v1/books", json={"title": "Book One"}).json()["id"]
    other_book_id = admin_client.post("/v1/books", json={"title": "Book Two"}).json()["id"]
    admin_client.post(f"/v1/books/{book_id}/chapters", json={"title": "Chapter A"})
    admin_client.post(f"/v1/books/{book_id}/chapters", json={"title": "Chapter B"})
    admin_client.post(f"/v1/books/{other_book_id}/chapters", json={"title": "Chapter C"})

    response = admin_client.get("/v1/books")
    book = next(b for b in response.json() if b["id"] == book_id)
    assert book["chapter_count"] == 2
