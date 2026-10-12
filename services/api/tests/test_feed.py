import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.documents.storage import StorageError
from app.feed.constants import FeedCategory
from app.feed.models import FeedPost
from app.feed.router import _category
from app.main import app
from app.users.models import AccountSettings, Profile

# conftest deliberately has no admin_client -- every suite that needs one
# defines its own (see test_books.py, test_chapters.py). Annotated
# Iterator[TestClient] rather than test_books' `-> TestClient`, which yields:
# CI runs mypy over `app` only, so that wart is invisible there.


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.UUID(int=1), email="admin@example.com")


@pytest.fixture
def other_admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.UUID(int=2), email="other-admin@example.com")


def _add_profile(db: Session, user: AuthenticatedUser, role: str, name: str) -> Profile:
    profile = Profile(
        id=user.id,
        role=role,
        display_name=name,
        settings=AccountSettings(user_id=user.id),
    )
    db.add(profile)
    db.commit()
    return profile


@pytest.fixture
def admin_client(
    client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> Iterator[TestClient]:
    _add_profile(db_session, admin_user, "admin", "Dr Popescu")
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def as_other_admin(db_session: Session, other_admin_user: AuthenticatedUser) -> Callable[[], None]:
    """Swaps the authenticated caller to a *second* admin.

    The point of the permission model is that an admin can act on a post they
    did not write, so the tests need two distinct admins rather than one.
    """

    def _switch() -> None:
        if db_session.get(Profile, other_admin_user.id) is None:
            _add_profile(db_session, other_admin_user, "admin", "Dr Ionescu")
        app.dependency_overrides[get_current_user] = lambda: other_admin_user

    return _switch


def _create(client: TestClient, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"title": "Timetable is up", "body": "Check the portal."}
    payload.update(overrides)
    response = client.post("/v1/feed", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _image_path() -> str:
    return f"feed/{uuid.uuid4()}.jpg"


# --- reading ---------------------------------------------------------------


def test_read_feed_requires_auth(client: TestClient) -> None:
    assert client.get("/v1/feed").status_code == 401


def test_learner_can_read_the_feed(
    admin_client: TestClient, authenticated_user: AuthenticatedUser, db_session: Session
) -> None:
    _create(admin_client, title="Exam dates")

    _add_profile(db_session, authenticated_user, "student", "Student")
    app.dependency_overrides[get_current_user] = lambda: authenticated_user

    body = admin_client.get("/v1/feed").json()
    assert [post["title"] for post in body] == ["Exam dates"]
    # The whole read-only half of the feature: a learner sees the post and is
    # told, by the server, that they may do nothing to it.
    assert body[0]["can_edit"] is False
    assert body[0]["can_delete"] is False


def test_response_carries_the_author(admin_client: TestClient) -> None:
    post = _create(admin_client)
    assert post["author"]["display_name"] == "Dr Popescu"
    assert post["can_edit"] is True
    assert post["can_delete"] is True


def test_feed_is_newest_first(admin_client: TestClient, db_session: Session) -> None:
    base = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
    db_session.add_all(
        [
            FeedPost(title="Oldest", body="b", category="news", published_at=base),
            FeedPost(
                title="Newest", body="b", category="news", published_at=base + timedelta(days=2)
            ),
            FeedPost(
                title="Middle", body="b", category="news", published_at=base + timedelta(days=1)
            ),
        ]
    )
    db_session.commit()

    titles = [post["title"] for post in admin_client.get("/v1/feed").json()]
    assert titles == ["Newest", "Middle", "Oldest"]


def test_posts_sharing_a_timestamp_are_ordered_by_id(
    admin_client: TestClient, db_session: Session
) -> None:
    """Pins the `id DESC` tiebreak, which makes the sort order total.

    Ids are chosen so that id-descending is the *reverse* of insertion order:
    without the tiebreak the database is free to return either, and a plain
    `ORDER BY published_at DESC` would pass here only by luck. A non-total
    order is a real bug under paging -- a row can appear on two pages, or on
    neither -- rather than a cosmetic wobble.
    """
    shared = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
    db_session.add_all(
        [
            FeedPost(
                id=uuid.UUID(int=0x10),
                title="Low id",
                body="b",
                category="news",
                published_at=shared,
            ),
            FeedPost(
                id=uuid.UUID(int=0x20),
                title="High id",
                body="b",
                category="news",
                published_at=shared,
            ),
        ]
    )
    db_session.commit()

    titles = [post["title"] for post in admin_client.get("/v1/feed").json()]
    assert titles == ["High id", "Low id"]


def test_feed_pagination(admin_client: TestClient) -> None:
    for index in range(5):
        _create(admin_client, title=f"Post {index}")

    page = admin_client.get("/v1/feed", params={"limit": 2, "offset": 2}).json()
    assert len(page) == 2

    everything = [post["title"] for post in admin_client.get("/v1/feed").json()]
    assert [post["title"] for post in page] == everything[2:4]


@pytest.mark.parametrize("limit", [0, 201])
def test_feed_rejects_out_of_range_limits(admin_client: TestClient, limit: int) -> None:
    assert admin_client.get("/v1/feed", params={"limit": limit}).status_code == 422


def test_post_outlives_its_author(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """author_id is SET NULL, not CASCADE.

    Also the test that catches an accidental inner join on profiles: with
    `join` instead of `outerjoin` the post would vanish from the list here
    rather than losing its byline.
    """
    _create(admin_client, title="Survives")

    profile = db_session.get(Profile, admin_user.id)
    assert profile is not None
    db_session.delete(profile)
    db_session.commit()

    body = admin_client.get("/v1/feed").json()
    assert [post["title"] for post in body] == ["Survives"]
    assert body[0]["author"] is None


def test_future_dated_posts_are_withheld(admin_client: TestClient, db_session: Session) -> None:
    db_session.add(
        FeedPost(
            title="Scheduled",
            body="b",
            category="news",
            published_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    db_session.commit()

    assert admin_client.get("/v1/feed").json() == []


def test_feed_does_not_n_plus_one_on_authors(
    admin_client: TestClient, count_queries: Callable[[], Any]
) -> None:
    _create(admin_client)
    with count_queries() as one_post:
        admin_client.get("/v1/feed")

    for index in range(11):
        _create(admin_client, title=f"Extra {index}")
    with count_queries() as twelve_posts:
        admin_client.get("/v1/feed")

    # Equal, not "small": the author join has to be part of the list query.
    assert one_post[0] == twelve_posts[0]


# --- writing is admin-only -------------------------------------------------


def test_learner_cannot_write(
    authed_client: TestClient, authenticated_user: AuthenticatedUser, db_session: Session
) -> None:
    _add_profile(db_session, authenticated_user, "student", "Student")

    assert authed_client.post("/v1/feed", json={"title": "t", "body": "b"}).status_code == 403
    post_id = uuid.uuid4()
    assert authed_client.patch(f"/v1/feed/{post_id}", json={"title": "t"}).status_code == 403
    assert authed_client.delete(f"/v1/feed/{post_id}").status_code == 403
    assert (
        authed_client.post(
            "/v1/feed/image-upload-url",
            json={"mime_type": "image/jpeg", "size_bytes": 1},
        ).status_code
        == 403
    )


def test_any_admin_can_edit_another_admins_post(
    admin_client: TestClient, as_other_admin: Callable[[], None]
) -> None:
    """The distinctive rule: permission is role-based, not ownership-based.

    Deliberately unlike flashcards, where can_edit is `created_by == user_id`.
    An announcement is institutional, so a second admin must be able to
    correct or pull one they did not write.
    """
    post = _create(admin_client, title="Typo in teh title")

    as_other_admin()

    listed = admin_client.get("/v1/feed").json()[0]
    assert listed["can_edit"] is True
    assert listed["can_delete"] is True
    assert listed["author"]["display_name"] == "Dr Popescu"  # still the original author

    edited = admin_client.patch(f"/v1/feed/{post['id']}", json={"title": "Typo in the title"})
    assert edited.status_code == 200
    assert edited.json()["title"] == "Typo in the title"
    # Editing does not steal the byline.
    assert edited.json()["author"]["display_name"] == "Dr Popescu"

    assert admin_client.delete(f"/v1/feed/{post['id']}").status_code == 204


def test_title_and_body_are_required(admin_client: TestClient) -> None:
    assert admin_client.post("/v1/feed", json={"body": "b"}).status_code == 422
    assert admin_client.post("/v1/feed", json={"title": "", "body": "b"}).status_code == 422
    assert admin_client.post("/v1/feed", json={"title": "t"}).status_code == 422
    assert admin_client.post("/v1/feed", json={"title": "t", "body": ""}).status_code == 422


def test_edit_cannot_blank_the_title_or_body(admin_client: TestClient) -> None:
    post = _create(admin_client)
    assert admin_client.patch(f"/v1/feed/{post['id']}", json={"title": ""}).status_code == 422
    assert admin_client.patch(f"/v1/feed/{post['id']}", json={"body": ""}).status_code == 422


@pytest.mark.parametrize("field", ["title", "body", "category"])
def test_edit_cannot_null_a_required_field(admin_client: TestClient, field: str) -> None:
    """An explicit null is a 422, not a 500.

    `min_length` does not constrain the None arm of `str | None`, so without an
    explicit check these reach the NOT NULL column and surface as an unhandled
    IntegrityError. `image_path` is the only field where null is meaningful.
    """
    post = _create(admin_client)
    response = admin_client.patch(f"/v1/feed/{post['id']}", json={field: None})
    assert response.status_code == 422
    assert field in response.text


def test_category_is_constrained_by_the_database(
    admin_client: TestClient, db_session: Session
) -> None:
    """`ck_feed_posts_category` is the first line of defence.

    Declared on the model as well as in 4b1d7ea3c602, so Base.metadata and the
    migration agree and this is actually enforced in the suite.
    """
    db_session.add(FeedPost(title="Legacy", body="b", category="exam"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_an_unknown_category_degrades_instead_of_failing_the_list() -> None:
    """The second line of defence, unit-tested because the first makes the
    integration path unreachable.

    It covers the window where the allowed set and the enum disagree -- a
    migration widening the constraint before the new code ships, or the
    reverse. Without it `FeedCategory(value)` raises and 500s the *whole*
    list for every caller, including the admin who would have to fix it. The
    chip is decorative; the announcement is not.
    """
    assert _category("news") == FeedCategory.NEWS
    assert _category("media") == FeedCategory.MEDIA
    assert _category("exam") == FeedCategory.NEWS


def test_image_path_rejects_a_trailing_newline(admin_client: TestClient) -> None:
    """`$` also matches just before a trailing newline in Python, so anchoring
    with it accepts a key this service never minted."""
    response = admin_client.post(
        "/v1/feed",
        json={"title": "t", "body": "b", "image_path": f"{_image_path()}\n"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_image_path"


def test_category_defaults_to_news_and_rejects_unknown_values(admin_client: TestClient) -> None:
    assert _create(admin_client)["category"] == "news"
    assert _create(admin_client, category="media")["category"] == "media"
    assert (
        admin_client.post(
            "/v1/feed", json={"title": "t", "body": "b", "category": "livestream"}
        ).status_code
        == 422
    )


def test_missing_post_is_404(admin_client: TestClient) -> None:
    post_id = uuid.uuid4()
    assert admin_client.patch(f"/v1/feed/{post_id}", json={"title": "t"}).status_code == 404
    assert admin_client.delete(f"/v1/feed/{post_id}").status_code == 404


# --- images ----------------------------------------------------------------


@pytest.mark.parametrize(
    "image_path",
    [
        "../../etc/passwd",
        "feed/whatever.exe",
        "feed/not-a-uuid.jpg",
        "other-bucket/3f2a1b0c-0000-4000-8000-000000000000.jpg",
        "feed/3f2a1b0c-0000-4000-8000-000000000000.jpg/extra",
    ],
)
def test_image_path_must_be_one_we_minted(admin_client: TestClient, image_path: str) -> None:
    """image_path arrives in the request body, so anything not matching the
    key this service mints is rejected -- otherwise a post could surface an
    arbitrary object out of a public bucket."""
    response = admin_client.post(
        "/v1/feed", json={"title": "t", "body": "b", "image_path": image_path}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_image_path"


def test_create_accepts_a_minted_image_path(admin_client: TestClient) -> None:
    path = _image_path()
    assert _create(admin_client, image_path=path)["image_path"] == path


@patch("app.feed.service.delete_object")
def test_replacing_an_image_deletes_the_old_object(
    delete_object: Any, admin_client: TestClient
) -> None:
    old, new = _image_path(), _image_path()
    post = _create(admin_client, image_path=old)

    response = admin_client.patch(f"/v1/feed/{post['id']}", json={"image_path": new})
    assert response.status_code == 200
    assert response.json()["image_path"] == new
    delete_object.assert_called_once_with(old, bucket="feed-images")


@patch("app.feed.service.delete_object")
def test_clearing_an_image_deletes_the_object(delete_object: Any, admin_client: TestClient) -> None:
    path = _image_path()
    post = _create(admin_client, image_path=path)

    response = admin_client.patch(f"/v1/feed/{post['id']}", json={"image_path": None})
    assert response.status_code == 200
    assert response.json()["image_path"] is None
    delete_object.assert_called_once_with(path, bucket="feed-images")


@patch("app.feed.service.delete_object")
def test_editing_other_fields_leaves_the_image_alone(
    delete_object: Any, admin_client: TestClient
) -> None:
    """Omitting image_path means "leave it"; sending null means "remove it".
    model_dump alone cannot tell those apart."""
    path = _image_path()
    post = _create(admin_client, image_path=path)

    response = admin_client.patch(f"/v1/feed/{post['id']}", json={"title": "New title"})
    assert response.status_code == 200
    assert response.json()["image_path"] == path
    delete_object.assert_not_called()


@patch("app.feed.service.delete_object")
def test_deleting_a_post_deletes_its_image(delete_object: Any, admin_client: TestClient) -> None:
    path = _image_path()
    post = _create(admin_client, image_path=path)

    assert admin_client.delete(f"/v1/feed/{post['id']}").status_code == 204
    assert admin_client.get("/v1/feed").json() == []
    # The bucket is public, so a pulled announcement's picture has to stop
    # being served -- not just stop being referenced.
    delete_object.assert_called_once_with(path, bucket="feed-images")


@pytest.mark.parametrize(
    "failure",
    [
        RuntimeError("SUPABASE_URL is not configured"),
        StorageError("Failed to delete object: 500"),
        # The ones a narrow `except (StorageError, RuntimeError)` missed:
        # httpx raises these from the transport, and they subclass
        # httpx.HTTPError -> Exception, so they escaped a commit that had
        # already succeeded and 500d a delete that in fact happened.
        httpx.ConnectError("connection refused"),
        httpx.ReadTimeout("timed out"),
    ],
)
def test_a_failed_image_delete_does_not_fail_the_request(
    admin_client: TestClient, failure: Exception
) -> None:
    """The row is already committed by then: an orphaned object is invisible,
    whereas a 500 would tell the admin their delete failed when it did not."""
    post = _create(admin_client, image_path=_image_path())
    with patch("app.feed.service.delete_object", side_effect=failure):
        assert admin_client.delete(f"/v1/feed/{post['id']}").status_code == 204
    assert admin_client.get("/v1/feed").json() == []


@patch("app.feed.service.create_signed_upload_url", return_value="signed-token")
def test_image_upload_url_mints_a_path_and_token(
    create_signed_upload_url: Any, admin_client: TestClient
) -> None:
    response = admin_client.post(
        "/v1/feed/image-upload-url",
        json={"mime_type": "image/png", "size_bytes": 1024},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token"] == "signed-token"
    # The extension comes from the mime type, never from a client filename.
    assert body["storage_path"].startswith("feed/")
    assert body["storage_path"].endswith(".png")
    create_signed_upload_url.assert_called_once_with(body["storage_path"], bucket="feed-images")


@patch("app.feed.service.create_signed_upload_url", return_value="signed-token")
def test_image_upload_url_is_reachable_despite_the_uuid_route(
    _create_signed_upload_url: Any, admin_client: TestClient
) -> None:
    """Pins the route ordering: /{post_id} is typed UUID, so if it were
    declared first this path would 422 instead of reaching the handler."""
    response = admin_client.post(
        "/v1/feed/image-upload-url",
        json={"mime_type": "image/jpeg", "size_bytes": 1},
    )
    assert response.status_code == 200


@pytest.mark.parametrize("mime_type", ["application/pdf", "image/heic", "", "image/jpeg; x=1"])
def test_image_upload_url_rejects_an_unsupported_mime(
    admin_client: TestClient, mime_type: str
) -> None:
    """The service's own error, not Pydantic's generic validation_error.

    `mime_type` is a plain `str` precisely so this path stays live: a Literal
    would reject during parsing and the caller would get no message naming the
    formats it can actually send.
    """
    response = admin_client.post(
        "/v1/feed/image-upload-url", json={"mime_type": mime_type, "size_bytes": 1}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "unsupported_media_type"


def test_image_upload_url_rejects_oversize(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/v1/feed/image-upload-url",
        json={"mime_type": "image/jpeg", "size_bytes": 5 * 1024 * 1024 + 1},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "file_too_large"


def test_image_upload_url_rejects_a_negative_size(admin_client: TestClient) -> None:
    """A negative size would otherwise sail past `> MAX_FEED_IMAGE_BYTES`."""
    response = admin_client.post(
        "/v1/feed/image-upload-url", json={"mime_type": "image/jpeg", "size_bytes": -1}
    )
    assert response.status_code == 422


@patch("app.feed.service.delete_object")
def test_an_image_two_posts_share_is_not_deleted_with_one_of_them(
    delete_object: Any, admin_client: TestClient
) -> None:
    """`image_path` arrives in the request body, so an admin can read one
    post's key off GET /v1/feed and PATCH it onto another. Deleting either
    must not pull the object out from under the one still showing it."""
    path = _image_path()
    first = _create(admin_client, title="First", image_path=path)
    second = _create(admin_client, title="Second", image_path=path)

    assert admin_client.delete(f"/v1/feed/{first['id']}").status_code == 204
    delete_object.assert_not_called()

    # Once the last reference goes, the object may be removed.
    assert admin_client.delete(f"/v1/feed/{second['id']}").status_code == 204
    delete_object.assert_called_once_with(path, bucket="feed-images")
