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


def _create_document(admin_client: TestClient, title: str, chapter_id: str | None = None) -> str:
    fake_pdf_bytes = b"%PDF-1.4 fake"
    checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
    payload = {
        "title": title,
        "storage_path": f"{title}.pdf",
        "mime_type": "application/pdf",
        "size_bytes": len(fake_pdf_bytes),
        "checksum": checksum,
    }
    if chapter_id is not None:
        payload["chapter_id"] = chapter_id

    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=[]),
    ):
        response = admin_client.post("/v1/documents", json=payload)
    assert response.status_code == 200
    return response.json()["id"]  # type: ignore[no-any-return]


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
    assert body["lesson_count"] == 0


def test_chapters_ordered_by_creation(admin_client: TestClient) -> None:
    admin_client.post("/v1/chapters", json={"title": "Chapter One"})
    admin_client.post("/v1/chapters", json={"title": "Chapter Two"})

    response = admin_client.get("/v1/chapters")
    assert response.status_code == 200
    titles = [chapter["title"] for chapter in response.json()]
    assert titles == ["Chapter One", "Chapter Two"]


def test_chapter_lesson_count_reflects_assigned_documents(admin_client: TestClient) -> None:
    chapter_id = admin_client.post("/v1/chapters", json={"title": "Chapter One"}).json()["id"]
    _create_document(admin_client, "Lesson 1", chapter_id=chapter_id)
    _create_document(admin_client, "Lesson 2", chapter_id=chapter_id)
    _create_document(admin_client, "Uncategorized lesson")

    response = admin_client.get("/v1/chapters")
    chapter = next(c for c in response.json() if c["id"] == chapter_id)
    assert chapter["lesson_count"] == 2


def test_list_documents_filtered_by_chapter(admin_client: TestClient) -> None:
    chapter_id = admin_client.post("/v1/chapters", json={"title": "Chapter One"}).json()["id"]
    other_chapter_id = admin_client.post("/v1/chapters", json={"title": "Chapter Two"}).json()["id"]
    lesson_in_chapter = _create_document(admin_client, "In chapter", chapter_id=chapter_id)
    _create_document(admin_client, "In other chapter", chapter_id=other_chapter_id)

    response = admin_client.get(f"/v1/documents?chapter_id={chapter_id}")
    assert response.status_code == 200
    ids = [doc["id"] for doc in response.json()]
    assert ids == [lesson_in_chapter]


def test_list_documents_uncategorized_bucket(admin_client: TestClient) -> None:
    chapter_id = admin_client.post("/v1/chapters", json={"title": "Chapter One"}).json()["id"]
    _create_document(admin_client, "In chapter", chapter_id=chapter_id)
    uncategorized_lesson = _create_document(admin_client, "No chapter yet")

    response = admin_client.get("/v1/documents?chapter_id=none")
    assert response.status_code == 200
    ids = [doc["id"] for doc in response.json()]
    assert ids == [uncategorized_lesson]


def test_list_documents_invalid_chapter_id_rejected(admin_client: TestClient) -> None:
    response = admin_client.get("/v1/documents?chapter_id=not-a-uuid")
    assert response.status_code == 422
