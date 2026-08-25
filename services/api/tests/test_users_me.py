from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.users.models import Profile


def test_me_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/me")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_me_creates_profile_on_first_access(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    response = authed_client.get("/v1/me")
    assert response.status_code == 200

    body = response.json()
    assert body["id"] == str(authenticated_user.id)
    assert body["email"] == authenticated_user.email
    assert body["display_name"] is None
    assert body["university"] is None
    assert body["settings"] == {
        "theme": "system",
        "notifications_enabled": True,
    }

    assert db_session.get(Profile, authenticated_user.id) is not None


def test_me_patch_updates_display_name(authed_client: TestClient) -> None:
    authed_client.get("/v1/me")

    response = authed_client.patch("/v1/me", json={"display_name": "Ada"})
    assert response.status_code == 200
    assert response.json()["display_name"] == "Ada"


def test_me_patch_updates_university(authed_client: TestClient) -> None:
    authed_client.get("/v1/me")

    response = authed_client.patch("/v1/me", json={"university": "MIT"})
    assert response.status_code == 200
    assert response.json()["university"] == "MIT"
