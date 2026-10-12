import logging
import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common.errors import ApiError
from app.documents.storage import create_signed_upload_url, delete_object
from app.feed.constants import (
    ALLOWED_IMAGE_MIME_TYPES,
    FEED_IMAGE_PREFIX,
    FEED_IMAGES_BUCKET,
    MAX_FEED_IMAGE_BYTES,
)
from app.feed.models import FeedPost
from app.feed.schemas import (
    FeedImageUploadUrlRequest,
    FeedPostCreateRequest,
    FeedPostUpdateRequest,
)
from app.users.models import Profile

logger = logging.getLogger(__name__)

_IMAGE_EXTENSIONS = "|".join(sorted(set(ALLOWED_IMAGE_MIME_TYPES.values())))

# Exactly the shape create_image_upload_url mints: the prefix, one uuid4, and
# an extension this module chose. Anchored at both ends (see fullmatch below),
# so no traversal segment or second extension can ride along.
#
# re.escape on the prefix because it is presented as a tunable in constants.py:
# changing it to "feed.v2" would otherwise turn the dot into a metacharacter
# and quietly widen the one check standing between a request-body image_path
# and an arbitrary object in a public bucket.
_IMAGE_PATH_PATTERN = re.compile(
    rf"^{re.escape(FEED_IMAGE_PREFIX)}/[0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}"
    rf"-[0-9a-f]{{4}}-[0-9a-f]{{12}}\.(?:{_IMAGE_EXTENSIONS})$"
)


def _validate_image_path(image_path: str | None) -> None:
    """Rejects any key this service did not mint.

    `image_path` arrives in the request body, so without this an admin -- or
    anything holding an admin token -- could point a post at an arbitrary
    object in the bucket. The bucket is public, so that would be a way to
    surface someone else's upload under an announcement's byline.
    """
    if image_path is None:
        return
    # fullmatch, not match: Python's `$` also matches just before a trailing
    # newline, so `match` accepts "feed/<uuid>.jpg\n" -- which then lands in a
    # getPublicUrl() on both clients and in a delete_object URL path here.
    if not _IMAGE_PATH_PATTERN.fullmatch(image_path):
        raise ApiError(422, "invalid_image_path", "image_path is not a feed image key")


def _discard_image(db: Session, image_path: str | None) -> None:
    """Best-effort removal of an image no post references any more.

    Always called *after* the database commit. The other order would risk
    deleting the object and then failing the commit, leaving a live post
    pointing at a missing image -- visible breakage, versus an orphaned
    object, which nobody can see. A failure here is logged and swallowed for
    the same reason: the user's edit did succeed.
    """
    if image_path is None:
        return

    # Nothing stops two posts holding the same key: `image_path` comes from the
    # request body, and an admin can read one post's key straight off
    # GET /v1/feed and PATCH it onto another -- it matches the minted shape, so
    # validation accepts it. Deleting or re-imaging either post would then pull
    # the object out from under the other, leaving a broken image in a public
    # bucket with nothing to explain it. So keep the object alive for as long
    # as any row still references it; the orphan that leaves behind is the
    # harmless direction.
    #
    # Both callers discard *after* their commit, so the post that just dropped
    # this key no longer references it -- any row found here is a different
    # post.
    still_referenced = db.scalar(
        select(FeedPost.id).where(FeedPost.image_path == image_path).limit(1)
    )
    if still_referenced is not None:
        logger.info(
            "Keeping feed image %s: still referenced by post %s", image_path, still_referenced
        )
        return

    try:
        delete_object(image_path, bucket=FEED_IMAGES_BUCKET)
    except Exception:
        # Deliberately broad. An earlier `except (StorageError, RuntimeError)`
        # looked careful and was the bug: httpx raises ConnectError and
        # ReadTimeout from the transport, both of which subclass
        # httpx.HTTPError -> Exception and neither of which was listed, so an
        # unreachable Storage propagated out of an already-committed request
        # and 500d a delete that had in fact succeeded -- exactly what this
        # function exists to prevent. Enumerating failure types here means
        # re-deriving httpx's hierarchy correctly forever; the contract is
        # simply "never fail the caller".
        logger.warning("Failed to delete feed image %s", image_path, exc_info=True)


def list_posts(db: Session, *, limit: int, offset: int) -> list[tuple[FeedPost, Profile | None]]:
    """Newest first, with each post's author in the same query.

    `outerjoin`, not `join`: author_id is SET NULL, so an inner join would
    silently hide exactly the posts that outliving their author is meant to
    preserve.

    Ordering on (published_at, id) rather than published_at alone makes the
    order total. Two posts sharing a timestamp -- a bulk insert, or two
    requests inside the same clock tick -- would otherwise be free to swap
    places between queries, which under paging means a genuinely skipped row
    rather than a cosmetic wobble.

    The published_at filter is a no-op while every post is published on
    creation. It is here so that a future-dated row (a hand-written insert
    today, scheduling later) cannot jump the list, and so FEED-3's
    "published only" is actually true of this endpoint.
    """
    rows = db.execute(
        select(FeedPost, Profile)
        .outerjoin(Profile, FeedPost.author_id == Profile.id)
        .where(FeedPost.published_at <= func.now())
        .order_by(FeedPost.published_at.desc(), FeedPost.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [(post, author) for post, author in rows]


def create_post(
    db: Session, author_id: uuid.UUID, data: FeedPostCreateRequest
) -> tuple[FeedPost, Profile | None]:
    _validate_image_path(data.image_path)

    post = FeedPost(
        title=data.title,
        body=data.body,
        category=data.category,
        image_path=data.image_path,
        author_id=author_id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post, db.get(Profile, author_id)


def update_post(
    db: Session, post_id: uuid.UUID, data: FeedPostUpdateRequest
) -> tuple[FeedPost, Profile | None]:
    """Any admin may edit any post -- there is deliberately no ownership check
    here, which is the difference from flashcards. See FeedPostResponse."""
    post = db.get(FeedPost, post_id)
    if post is None:
        raise ApiError(404, "not_found", "Post not found")

    # `image_path` present-and-null means "remove the picture"; absent means
    # "leave it alone". model_dump alone cannot tell those apart, hence
    # model_fields_set -- the same distinction app/questions/service.py draws
    # for document_id.
    replaced_image: str | None = None
    if "image_path" in data.model_fields_set and data.image_path != post.image_path:
        _validate_image_path(data.image_path)
        replaced_image = post.image_path

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(post, field, value)

    db.commit()
    db.refresh(post)

    _discard_image(db, replaced_image)

    author = db.get(Profile, post.author_id) if post.author_id is not None else None
    return post, author


def delete_post(db: Session, post_id: uuid.UUID) -> None:
    """Hard delete, by any admin. No archived tier: nothing holds review state
    against an announcement, and a post pulled for being wrong should stop
    being reachable -- including its image, which lives in a public bucket and
    would otherwise stay served forever."""
    post = db.get(FeedPost, post_id)
    if post is None:
        raise ApiError(404, "not_found", "Post not found")

    image_path = post.image_path
    db.delete(post)
    db.commit()

    _discard_image(db, image_path)


def create_image_upload_url(data: FeedImageUploadUrlRequest) -> tuple[str, str]:
    """Mints a path and a signed upload token, mirroring
    documents.service.create_upload_url.

    The extension comes from the declared mime type, never from a
    client-supplied filename, and the uuid is fresh on every call rather than
    keyed on a post: replacing a picture then writes a new object instead of
    upserting over the live one, so nothing serves a stale image from cache
    and the old key stays valid until we delete it deliberately.
    """
    extension = ALLOWED_IMAGE_MIME_TYPES.get(data.mime_type)
    if extension is None:
        raise ApiError(
            422, "unsupported_media_type", "Only JPEG, PNG and WebP images are supported"
        )
    if data.size_bytes > MAX_FEED_IMAGE_BYTES:
        raise ApiError(422, "file_too_large", "Image exceeds the 5MB upload limit")

    storage_path = f"{FEED_IMAGE_PREFIX}/{uuid.uuid4()}.{extension}"
    token = create_signed_upload_url(storage_path, bucket=FEED_IMAGES_BUCKET)
    return storage_path, token
