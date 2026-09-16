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


@pytest.fixture
def book_id(client: TestClient, admin_user: AuthenticatedUser, db_session: Session) -> str:
    # Deliberately does *not* depend on `admin_client` — see the identical
    # comment on `test_sub_chapters.py`'s `chapter_id` fixture: that fixture
    # only pops its `get_current_user` override at test teardown, which
    # would leak admin auth into a later request in the same test meant to
    # exercise the unauthenticated/non-admin path. Idempotent for the same
    # reason: a test combining this with `admin_client` would otherwise hit
    # a UNIQUE constraint violation inserting the same profile twice.
    if db_session.get(Profile, admin_user.id) is None:
        db_session.add(
            Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
        )
        db_session.commit()
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: admin_user
    response = client.post("/v1/books", json={"title": "Book One"})
    if previous_override is not None:
        app.dependency_overrides[get_current_user] = previous_override
    else:
        app.dependency_overrides.pop(get_current_user, None)
    return response.json()["id"]  # type: ignore[no-any-return]


def test_list_chapters_requires_auth(client: TestClient, book_id: str) -> None:
    response = client.get(f"/v1/books/{book_id}/chapters")
    assert response.status_code == 401


def test_create_chapter_requires_admin(authed_client: TestClient, book_id: str) -> None:
    response = authed_client.post(
        f"/v1/books/{book_id}/chapters", json={"title": "Intro to Systems"}
    )
    assert response.status_code == 403


def test_create_chapter_as_admin(admin_client: TestClient, book_id: str) -> None:
    response = admin_client.post(
        f"/v1/books/{book_id}/chapters", json={"title": "Intro to Systems"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Intro to Systems"
    assert body["book_id"] == book_id
    assert body["order_index"] == 0
    assert body["sub_chapter_count"] == 0


def test_create_chapter_for_missing_book_404s(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/v1/books/00000000-0000-0000-0000-000000000000/chapters",
        json={"title": "Intro to Systems"},
    )
    assert response.status_code == 404


def test_list_chapters_for_missing_book_404s(authed_client: TestClient) -> None:
    response = authed_client.get("/v1/books/00000000-0000-0000-0000-000000000000/chapters")
    assert response.status_code == 404


def test_chapters_ordered_by_creation(admin_client: TestClient, book_id: str) -> None:
    admin_client.post(f"/v1/books/{book_id}/chapters", json={"title": "Chapter One"})
    admin_client.post(f"/v1/books/{book_id}/chapters", json={"title": "Chapter Two"})

    response = admin_client.get(f"/v1/books/{book_id}/chapters")
    assert response.status_code == 200
    titles = [chapter["title"] for chapter in response.json()]
    assert titles == ["Chapter One", "Chapter Two"]


def test_chapters_scoped_to_their_book(admin_client: TestClient, book_id: str) -> None:
    other_book_id = admin_client.post("/v1/books", json={"title": "Book Two"}).json()["id"]
    admin_client.post(f"/v1/books/{book_id}/chapters", json={"title": "Chapter A"})
    admin_client.post(f"/v1/books/{other_book_id}/chapters", json={"title": "Chapter B"})

    response = admin_client.get(f"/v1/books/{book_id}/chapters")
    titles = [chapter["title"] for chapter in response.json()]
    assert titles == ["Chapter A"]


def test_chapter_sub_chapter_count_reflects_created_sub_chapters(
    admin_client: TestClient, book_id: str
) -> None:
    chapter_id = admin_client.post(
        f"/v1/books/{book_id}/chapters", json={"title": "Chapter One"}
    ).json()["id"]
    other_chapter_id = admin_client.post(
        f"/v1/books/{book_id}/chapters", json={"title": "Chapter Two"}
    ).json()["id"]
    admin_client.post(f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"})
    admin_client.post(f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub B"})
    admin_client.post(f"/v1/chapters/{other_chapter_id}/sub-chapters", json={"title": "Sub C"})

    response = admin_client.get(f"/v1/books/{book_id}/chapters")
    chapter = next(c for c in response.json() if c["id"] == chapter_id)
    assert chapter["sub_chapter_count"] == 2
