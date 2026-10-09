import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.feed.constants import DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT, FeedCategory
from app.feed.models import FeedPost
from app.feed.schemas import (
    FeedAuthorResponse,
    FeedImageUploadUrlRequest,
    FeedImageUploadUrlResponse,
    FeedPostCreateRequest,
    FeedPostResponse,
    FeedPostUpdateRequest,
)
from app.feed.service import (
    create_image_upload_url,
    create_post,
    delete_post,
    list_posts,
    update_post,
)
from app.users.constants import Role
from app.users.models import Profile
from app.users.service import get_or_create_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/feed", tags=["feed"])


def _category(value: str) -> FeedCategory:
    """Coerce a stored category, degrading rather than failing the request.

    `category` is a plain String column, so a hand-written insert or a row
    predating the news/media narrowing can hold something outside the enum --
    and `FeedCategory(value)` would then raise, 500ing the *whole list* for
    every caller, including the admin who would have to fix it. The chip is
    decorative; the announcement is not, so the post stays readable and the
    bad value is logged instead. Migration 4b1d7ea3c602 also carries a CHECK
    constraint, so this is the second line of defence rather than the first.
    """
    try:
        return FeedCategory(value)
    except ValueError:
        logger.warning("Feed post has an unrecognised category %r; showing it as news", value)
        return FeedCategory.NEWS


def _to_response(post: FeedPost, author: Profile | None, *, is_admin: bool) -> FeedPostResponse:
    """Unlike flashcards' can_edit/can_delete (app/flashcards/router.py:63),
    these are NOT ownership-based. That is deliberate, not an oversight.

    A flashcard is a learner's own study material, so ownership is the right
    axis there. An announcement is institutional: any admin must be able to
    correct a typo or pull a wrong post, including one written by an admin who
    has since left -- which is also why author_id is SET NULL rather than
    CASCADE. `author_id` records who wrote it; it is never an access-control
    input.

    They are still computed here rather than inferred client-side, for the
    reason ad08d02 established: clients that derive permissions drift from the
    endpoint that enforces them. The arithmetic is trivial today, but the
    policy lives in one place, so narrowing it later -- to the author alone, or
    to a moderator role -- is a server-side edit with no client change.
    See docs/architecture/feed.md.
    """
    return FeedPostResponse(
        id=post.id,
        title=post.title,
        body=post.body,
        category=_category(post.category),
        image_path=post.image_path,
        author=FeedAuthorResponse.model_validate(author) if author is not None else None,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
        can_edit=is_admin,
        can_delete=is_admin,
    )


@router.get("", response_model=list[FeedPostResponse])
def read_feed(
    limit: int = Query(DEFAULT_FEED_LIMIT, ge=1, le=MAX_FEED_LIMIT),
    offset: int = Query(0, ge=0),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FeedPostResponse]:
    """Readable by every signed-in user -- the announcements are the point."""
    profile = get_or_create_profile(db, user)
    is_admin = profile.role == Role.ADMIN
    return [
        _to_response(post, author, is_admin=is_admin)
        for post, author in list_posts(db, limit=limit, offset=offset)
    ]


# Declared before /{post_id}: post_id is typed UUID, so a static route placed
# after it would 422 on this path rather than fall through to it. Same reason
# documents' /upload-url comes before /{document_id}.
@router.post("/image-upload-url", response_model=FeedImageUploadUrlResponse)
def request_image_upload_url(
    data: FeedImageUploadUrlRequest,
    user: AuthenticatedUser = Depends(require_admin),
) -> FeedImageUploadUrlResponse:
    """The real write gate on the feed-images bucket.

    That bucket has no INSERT policy at all, so this endpoint minting a signed
    token under require_admin is the only path to writing an object -- RLS has
    no admin concept to express it with.
    """
    storage_path, token = create_image_upload_url(data)
    return FeedImageUploadUrlResponse(storage_path=storage_path, token=token)


@router.post("", response_model=FeedPostResponse, status_code=201)
def create_feed_post(
    data: FeedPostCreateRequest,
    user: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> FeedPostResponse:
    # An admin can reach this before ever calling GET /v1/me, and author_id
    # FKs against profiles.id -- so the row has to exist first.
    profile = get_or_create_profile(db, user)
    post, author = create_post(db, profile.id, data)
    return _to_response(post, author, is_admin=True)


@router.patch("/{post_id}", response_model=FeedPostResponse)
def edit_feed_post(
    post_id: UUID,
    data: FeedPostUpdateRequest,
    user: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> FeedPostResponse:
    """Any admin, any post -- including one they did not write."""
    post, author = update_post(db, post_id, data)
    return _to_response(post, author, is_admin=True)


@router.delete("/{post_id}", status_code=204)
def remove_feed_post(
    post_id: UUID,
    user: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Response:
    """Any admin, any post. Hard delete, and the image goes with it."""
    delete_post(db, post_id)
    return Response(status_code=204)
