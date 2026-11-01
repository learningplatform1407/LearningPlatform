import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.documents.models import Document, LecturePdf
from app.main import app
from app.users.models import AccountSettings, Profile


@pytest.fixture
def owner_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="owner@example.com")


@pytest.fixture
def other_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")


@pytest.fixture
def lesson_with_pdf(db_session: Session, owner_user: AuthenticatedUser) -> uuid.UUID:
    db_session.add(Profile(id=owner_user.id, settings=AccountSettings(user_id=owner_user.id)))
    db_session.flush()

    document = Document(title="Test Lecture", created_by=owner_user.id)
    db_session.add(document)
    db_session.flush()

    lecture_pdf = LecturePdf(
        document_id=document.id,
        storage_path="book.pdf",
        mime_type="application/pdf",
        size_bytes=10,
        checksum="abc",
        status="ready",
    )
    db_session.add(lecture_pdf)
    db_session.commit()
    return document.id


@pytest.fixture
def lesson_without_pdf(db_session: Session, owner_user: AuthenticatedUser) -> uuid.UUID:
    db_session.merge(Profile(id=owner_user.id, settings=AccountSettings(user_id=owner_user.id)))
    db_session.flush()
    document = Document(title="No PDF Lecture", created_by=owner_user.id)
    db_session.add(document)
    db_session.commit()
    return document.id


def _stroke() -> dict:
    # pressure round-trips through StrokePoint as an explicit None when
    # omitted, not an absent key -- include it so the response comparison
    # is exact.
    return {
        "color": "#1f2937",
        "width": 0.006,
        "points": [
            {"x": 0.1, "y": 0.2, "pressure": None},
            {"x": 0.3, "y": 0.4, "pressure": 0.5},
        ],
    }


def test_ink_requires_auth(client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    response = client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert response.status_code == 401


def test_get_ink_defaults_to_empty(authed_client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    response = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert response.status_code == 200
    assert response.json() == {"strokes": []}


def test_put_ink_replaces_full_array(authed_client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    response = authed_client.put(
        f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": [_stroke()]}
    )
    assert response.status_code == 200
    assert response.json()["strokes"] == [_stroke()]

    # A second PUT with fewer strokes fully replaces, it doesn't append.
    response = authed_client.put(
        f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": []}
    )
    assert response.status_code == 200
    assert response.json()["strokes"] == []

    get_response = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert get_response.json()["strokes"] == []


def test_ink_is_scoped_per_user(
    client: TestClient,
    lesson_with_pdf: uuid.UUID,
    owner_user: AuthenticatedUser,
    other_user: AuthenticatedUser,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: owner_user
    put_response = client.put(
        f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": [_stroke()]}
    )
    assert put_response.status_code == 200

    app.dependency_overrides[get_current_user] = lambda: other_user
    other_get = client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert other_get.json()["strokes"] == []

    app.dependency_overrides.pop(get_current_user, None)


def test_ink_is_scoped_per_page(authed_client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    authed_client.put(f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": [_stroke()]})
    page_two = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/2/ink")
    assert page_two.json()["strokes"] == []


def test_ink_404s_when_lesson_has_no_lecture_pdf(
    authed_client: TestClient, lesson_without_pdf: uuid.UUID
) -> None:
    get_response = authed_client.get(f"/v1/documents/{lesson_without_pdf}/pages/1/ink")
    assert get_response.status_code == 404

    put_response = authed_client.put(
        f"/v1/documents/{lesson_without_pdf}/pages/1/ink", json={"strokes": []}
    )
    assert put_response.status_code == 404
