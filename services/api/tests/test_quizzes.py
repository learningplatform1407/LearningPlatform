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
    # Deliberately does *not* depend on an `admin_client`-style fixture —
    # that pattern only pops its `get_current_user` override at test
    # teardown, which would leak admin auth into any later request in the
    # same test that's meant to exercise the unauthenticated path.
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


def test_list_quizzes_requires_auth(client: TestClient, document_id: str) -> None:
    response = client.get(f"/v1/documents/{document_id}/quizzes")
    assert response.status_code == 401


def test_list_quizzes_is_empty_by_default(authed_client: TestClient, document_id: str) -> None:
    response = authed_client.get(f"/v1/documents/{document_id}/quizzes")
    assert response.status_code == 200
    assert response.json() == []
