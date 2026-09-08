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


@pytest.fixture
def chapter_id(client: TestClient, admin_user: AuthenticatedUser, db_session: Session) -> str:
    # Deliberately does *not* depend on `admin_client` — that fixture only
    # pops its `get_current_user` override at test teardown, which would
    # leak admin auth into any later request in the same test (including
    # ones made via the plain `client`/`authed_client` fixtures) that's
    # meant to exercise the unauthenticated/non-admin path.
    # Idempotent — a test combining this with `admin_client` (which inserts
    # the same profile) would otherwise hit a UNIQUE constraint violation.
    if db_session.get(Profile, admin_user.id) is None:
        db_session.add(
            Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
        )
        db_session.commit()
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: admin_user
    response = client.post("/v1/chapters", json={"title": "Chapter One"})
    if previous_override is not None:
        app.dependency_overrides[get_current_user] = previous_override
    else:
        app.dependency_overrides.pop(get_current_user, None)
    return response.json()["id"]  # type: ignore[no-any-return]


def _create_document(
    admin_client: TestClient, title: str, sub_chapter_id: str | None = None
) -> str:
    fake_pdf_bytes = b"%PDF-1.4 fake"
    checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
    payload = {
        "title": title,
        "storage_path": f"{title}.pdf",
        "mime_type": "application/pdf",
        "size_bytes": len(fake_pdf_bytes),
        "checksum": checksum,
    }
    if sub_chapter_id is not None:
        payload["sub_chapter_id"] = sub_chapter_id

    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=[]),
    ):
        response = admin_client.post("/v1/documents", json=payload)
    assert response.status_code == 200
    return response.json()["id"]  # type: ignore[no-any-return]


def test_list_sub_chapters_requires_auth(client: TestClient, chapter_id: str) -> None:
    response = client.get(f"/v1/chapters/{chapter_id}/sub-chapters")
    assert response.status_code == 401


def test_create_sub_chapter_requires_admin(authed_client: TestClient, chapter_id: str) -> None:
    response = authed_client.post(
        f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"}
    )
    assert response.status_code == 403


def test_create_sub_chapter_as_admin(admin_client: TestClient, chapter_id: str) -> None:
    response = admin_client.post(
        f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Sub A"
    assert body["chapter_id"] == chapter_id
    assert body["order_index"] == 0
    assert body["lesson_count"] == 0


def test_create_sub_chapter_for_missing_chapter_404s(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/v1/chapters/00000000-0000-0000-0000-000000000000/sub-chapters",
        json={"title": "Sub A"},
    )
    assert response.status_code == 404


def test_list_sub_chapters_for_missing_chapter_404s(authed_client: TestClient) -> None:
    response = authed_client.get(
        "/v1/chapters/00000000-0000-0000-0000-000000000000/sub-chapters"
    )
    assert response.status_code == 404


def test_sub_chapters_ordered_by_creation(admin_client: TestClient, chapter_id: str) -> None:
    admin_client.post(f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub One"})
    admin_client.post(f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub Two"})

    response = admin_client.get(f"/v1/chapters/{chapter_id}/sub-chapters")
    assert response.status_code == 200
    titles = [sub["title"] for sub in response.json()]
    assert titles == ["Sub One", "Sub Two"]


def test_sub_chapters_scoped_to_their_chapter(admin_client: TestClient, chapter_id: str) -> None:
    other_chapter_id = admin_client.post("/v1/chapters", json={"title": "Chapter Two"}).json()["id"]
    admin_client.post(f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"})
    admin_client.post(f"/v1/chapters/{other_chapter_id}/sub-chapters", json={"title": "Sub B"})

    response = admin_client.get(f"/v1/chapters/{chapter_id}/sub-chapters")
    titles = [sub["title"] for sub in response.json()]
    assert titles == ["Sub A"]


def test_sub_chapter_lesson_count_reflects_assigned_documents(
    admin_client: TestClient, chapter_id: str
) -> None:
    sub_chapter_id = admin_client.post(
        f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"}
    ).json()["id"]
    _create_document(admin_client, "Lesson 1", sub_chapter_id=sub_chapter_id)
    _create_document(admin_client, "Lesson 2", sub_chapter_id=sub_chapter_id)
    _create_document(admin_client, "Uncategorized lesson")

    response = admin_client.get(f"/v1/chapters/{chapter_id}/sub-chapters")
    sub_chapter = response.json()[0]
    assert sub_chapter["lesson_count"] == 2


def test_list_documents_filtered_by_sub_chapter(admin_client: TestClient, chapter_id: str) -> None:
    sub_chapter_id = admin_client.post(
        f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"}
    ).json()["id"]
    other_sub_chapter_id = admin_client.post(
        f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub B"}
    ).json()["id"]
    lesson_in_sub = _create_document(admin_client, "In sub A", sub_chapter_id=sub_chapter_id)
    _create_document(admin_client, "In sub B", sub_chapter_id=other_sub_chapter_id)

    response = admin_client.get(f"/v1/documents?sub_chapter_id={sub_chapter_id}")
    assert response.status_code == 200
    ids = [doc["id"] for doc in response.json()]
    assert ids == [lesson_in_sub]


def test_list_documents_uncategorized_bucket(admin_client: TestClient, chapter_id: str) -> None:
    sub_chapter_id = admin_client.post(
        f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"}
    ).json()["id"]
    _create_document(admin_client, "In sub", sub_chapter_id=sub_chapter_id)
    uncategorized_lesson = _create_document(admin_client, "No sub-chapter yet")

    response = admin_client.get("/v1/documents?sub_chapter_id=none")
    assert response.status_code == 200
    ids = [doc["id"] for doc in response.json()]
    assert ids == [uncategorized_lesson]


def test_list_documents_invalid_sub_chapter_id_rejected(admin_client: TestClient) -> None:
    response = admin_client.get("/v1/documents?sub_chapter_id=not-a-uuid")
    assert response.status_code == 422


def test_document_response_includes_sub_chapter_and_chapter_breadcrumb(
    admin_client: TestClient, chapter_id: str
) -> None:
    sub_chapter_id = admin_client.post(
        f"/v1/chapters/{chapter_id}/sub-chapters", json={"title": "Sub A"}
    ).json()["id"]
    document_id = _create_document(admin_client, "Lesson 1", sub_chapter_id=sub_chapter_id)

    response = admin_client.get(f"/v1/documents/{document_id}")
    assert response.status_code == 200
    sub_chapter = response.json()["sub_chapter"]
    assert sub_chapter["id"] == sub_chapter_id
    assert sub_chapter["title"] == "Sub A"
    assert sub_chapter["chapter"]["id"] == chapter_id
    assert sub_chapter["chapter"]["title"] == "Chapter One"


def test_document_response_sub_chapter_is_null_when_uncategorized(admin_client: TestClient) -> None:
    document_id = _create_document(admin_client, "Loose lesson")

    response = admin_client.get(f"/v1/documents/{document_id}")
    assert response.status_code == 200
    assert response.json()["sub_chapter"] is None
