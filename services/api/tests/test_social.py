import uuid
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.main import app
from app.social.models import Follow
from app.users.models import Profile
from app.users.service import get_or_create_profile

MakeUser = Callable[..., AuthenticatedUser]


@pytest.fixture
def make_user(db_session: Session) -> MakeUser:
    def _make(name: str | None = None, *, public: bool = True) -> AuthenticatedUser:
        user = AuthenticatedUser(id=uuid.uuid4(), email=f"{uuid.uuid4().hex}@example.com")
        profile = get_or_create_profile(db_session, user)
        profile.display_name = name
        profile.settings.profile_public = public
        db_session.commit()
        return user

    return _make


@pytest.fixture
def act_as(client: TestClient) -> Iterator[Callable[[AuthenticatedUser], TestClient]]:
    """Switches which user the client is signed in as, mid-test."""

    def _as(user: AuthenticatedUser) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return client

    yield _as
    app.dependency_overrides.pop(get_current_user, None)


# --- the public-profile setting -------------------------------------------


def test_going_public_needs_a_display_name(authed_client: TestClient) -> None:
    authed_client.get("/v1/me")

    response = authed_client.patch("/v1/me", json={"profile_public": True})

    assert response.status_code == 422
    assert response.json()["code"] == "display_name_required"
    assert authed_client.get("/v1/me").json()["settings"]["profile_public"] is False


def test_going_public_and_naming_yourself_in_one_request_works(
    authed_client: TestClient,
) -> None:
    authed_client.get("/v1/me")

    response = authed_client.patch("/v1/me", json={"profile_public": True, "display_name": "Ana"})

    assert response.status_code == 200
    assert response.json()["settings"]["profile_public"] is True


def test_a_public_profile_cannot_clear_its_name(authed_client: TestClient) -> None:
    authed_client.patch("/v1/me", json={"profile_public": True, "display_name": "Ana"})

    response = authed_client.patch("/v1/me", json={"display_name": "  "})

    assert response.status_code == 422
    assert authed_client.get("/v1/me").json()["display_name"] == "Ana"


# --- search -----------------------------------------------------------------


def test_search_finds_public_users_by_part_of_their_name(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana Popescu")
    make_user("Mihai")

    body = act_as(viewer).get("/v1/users/search", params={"q": "pop"}).json()

    assert [row["id"] for row in body] == [str(ana.id)]
    assert body[0]["display_name"] == "Ana Popescu"
    assert body[0]["is_following"] is False


def test_search_never_returns_private_users_or_the_caller(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Ana One")
    make_user("Ana Two", public=False)

    body = act_as(viewer).get("/v1/users/search", params={"q": "ana"}).json()

    assert body == []


def test_search_ignores_queries_under_two_characters(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Viewer")
    make_user("Ana")

    assert act_as(viewer).get("/v1/users/search", params={"q": " a "}).json() == []


def test_search_treats_like_wildcards_literally(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Viewer")
    make_user("Ana")
    percent = make_user("100% Ana")

    body = act_as(viewer).get("/v1/users/search", params={"q": "0%"}).json()

    assert [row["id"] for row in body] == [str(percent.id)]


def test_search_requires_auth(client: TestClient) -> None:
    assert client.get("/v1/users/search", params={"q": "ana"}).status_code == 401


# --- profiles ---------------------------------------------------------------


def test_a_public_profile_shows_stats_and_counts(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    act_as(viewer).post(f"/v1/users/{ana.id}/follow")

    response = act_as(viewer).get(f"/v1/users/{ana.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Ana"
    assert body["is_following"] is True
    assert body["followers_count"] == 1
    assert body["following_count"] == 0
    assert body["stats"]["exams_completed"] == 0
    assert "email" not in body


def test_a_private_profile_is_not_found_by_others(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Viewer")
    hidden = make_user("Hidden", public=False)

    response = act_as(viewer).get(f"/v1/users/{hidden.id}")

    assert response.status_code == 404
    assert response.json()["code"] == "user_not_found"


def test_you_can_always_open_your_own_profile(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    me = make_user("Me", public=False)

    assert act_as(me).get(f"/v1/users/{me.id}").status_code == 200


def test_an_unknown_user_is_not_found(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Viewer")

    assert act_as(viewer).get(f"/v1/users/{uuid.uuid4()}").status_code == 404


# --- following --------------------------------------------------------------


def test_follow_and_unfollow_are_idempotent(
    make_user: MakeUser,
    act_as: Callable[[AuthenticatedUser], TestClient],
    db_session: Session,
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    client = act_as(viewer)

    assert client.post(f"/v1/users/{ana.id}/follow").status_code == 204
    assert client.post(f"/v1/users/{ana.id}/follow").status_code == 204
    assert db_session.query(Follow).count() == 1

    assert client.delete(f"/v1/users/{ana.id}/follow").status_code == 204
    assert client.delete(f"/v1/users/{ana.id}/follow").status_code == 204
    assert db_session.query(Follow).count() == 0


def test_a_private_user_cannot_be_followed(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    viewer = make_user("Viewer")
    hidden = make_user("Hidden", public=False)

    assert act_as(viewer).post(f"/v1/users/{hidden.id}/follow").status_code == 404


def test_you_cannot_follow_yourself(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    me = make_user("Me")

    response = act_as(me).post(f"/v1/users/{me.id}/follow")

    assert response.status_code == 400
    assert response.json()["code"] == "cannot_follow_self"


def test_a_brand_new_account_can_follow_before_ever_loading_its_profile(
    make_user: MakeUser,
    act_as: Callable[[AuthenticatedUser], TestClient],
    db_session: Session,
) -> None:
    ana = make_user("Ana")
    newcomer = AuthenticatedUser(id=uuid.uuid4(), email="new@example.com")

    assert act_as(newcomer).post(f"/v1/users/{ana.id}/follow").status_code == 204
    assert db_session.get(Profile, newcomer.id) is not None


def test_lists_show_both_directions_with_flags(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    me = make_user("Me")
    ana = make_user("Ana")
    bogdan = make_user("Bogdan")
    act_as(me).post(f"/v1/users/{ana.id}/follow")
    act_as(ana).post(f"/v1/users/{me.id}/follow")
    act_as(bogdan).post(f"/v1/users/{me.id}/follow")

    following = act_as(me).get("/v1/me/following").json()
    followers = act_as(me).get("/v1/me/followers").json()

    assert [(row["display_name"], row["follows_you"]) for row in following] == [("Ana", True)]
    assert [(row["display_name"], row["is_following"]) for row in followers] == [
        ("Ana", True),
        ("Bogdan", False),
    ]


def test_going_private_hides_you_but_keeps_your_followers(
    make_user: MakeUser,
    act_as: Callable[[AuthenticatedUser], TestClient],
    db_session: Session,
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    act_as(viewer).post(f"/v1/users/{ana.id}/follow")

    act_as(ana).patch("/v1/me", json={"profile_public": False})

    assert act_as(viewer).get("/v1/me/following").json() == []
    assert act_as(viewer).get(f"/v1/users/{ana.id}").status_code == 404
    assert db_session.query(Follow).count() == 1

    act_as(ana).patch("/v1/me", json={"profile_public": True})

    assert [row["id"] for row in act_as(viewer).get("/v1/me/following").json()] == [str(ana.id)]


def test_a_private_follower_is_not_listed_or_counted(
    make_user: MakeUser, act_as: Callable[[AuthenticatedUser], TestClient]
) -> None:
    ana = make_user("Ana")
    lurker = make_user("Lurker", public=False)
    act_as(lurker).post(f"/v1/users/{ana.id}/follow")

    assert act_as(ana).get("/v1/me/followers").json() == []
    assert act_as(ana).get(f"/v1/users/{ana.id}").json()["followers_count"] == 0


def test_you_can_remove_a_follower(
    make_user: MakeUser,
    act_as: Callable[[AuthenticatedUser], TestClient],
    db_session: Session,
) -> None:
    ana = make_user("Ana")
    fan = make_user("Fan")
    act_as(fan).post(f"/v1/users/{ana.id}/follow")

    assert act_as(ana).delete(f"/v1/me/followers/{fan.id}").status_code == 204
    assert db_session.query(Follow).count() == 0


def test_deleting_an_account_removes_its_follows(
    make_user: MakeUser,
    act_as: Callable[[AuthenticatedUser], TestClient],
    db_session: Session,
) -> None:
    ana = make_user("Ana")
    fan = make_user("Fan")
    act_as(fan).post(f"/v1/users/{ana.id}/follow")

    db_session.delete(db_session.get(Profile, fan.id))
    db_session.commit()

    assert db_session.query(Follow).count() == 0
