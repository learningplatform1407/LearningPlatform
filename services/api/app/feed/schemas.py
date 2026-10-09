from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.feed.constants import FeedCategory


class FeedAuthorResponse(BaseModel):
    """The authoring admin, as the post header shows them.

    `display_name` is nullable on the profile itself (no default), so both
    clients fall back rather than rendering an empty byline.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str | None
    avatar_url: str | None


class FeedPostResponse(BaseModel):
    """One announcement as the list renders it."""

    id: UUID
    title: str
    body: str
    category: FeedCategory
    # The Storage key, not a URL -- the clients resolve it with
    # getPublicUrl(), which is a synchronous string concat against the public
    # feed-images bucket. See FeedPost.image_path for why it is stored so.
    image_path: str | None
    # Null once the authoring admin's profile is deleted. The announcement
    # deliberately outlives its author (FeedPost.author_id is SET NULL), so
    # this being None is a normal state and not an error.
    author: FeedAuthorResponse | None
    published_at: datetime
    created_at: datetime
    updated_at: datetime
    # Computed per caller, and -- unlike flashcards' identically-named fields
    # -- NOT ownership-based: any admin may edit or delete any post. An
    # announcement is institutional speech, so a wrong one must be fixable by
    # whoever is on duty rather than by its author alone.
    #
    # They are still computed here rather than inferred client-side, which is
    # the seam ad08d02 established after both clients derived a flashcard
    # permission and got it wrong. The arithmetic is trivial today; the point
    # is that narrowing the rule later is a server-side edit with no client
    # change. See docs/architecture/feed.md.
    can_edit: bool
    can_delete: bool


class FeedPostCreateRequest(BaseModel):
    """Note the absence of `author_id` and `published_at`: the first is the
    authenticated caller, the second is the row's server_default. Neither is
    read from the payload."""

    title: str = Field(min_length=1)
    body: str = Field(min_length=1)
    category: FeedCategory = FeedCategory.NEWS
    image_path: str | None = None


class FeedPostUpdateRequest(BaseModel):
    """Every field optional, and `image_path: null` is meaningful -- it clears
    the picture, which is different from omitting the field and leaving it
    alone. The service tells them apart with `model_fields_set`.

    `title` and `body` keep min_length=1 so an edit cannot blank them; absent
    is the only way to leave them untouched.
    """

    title: str | None = Field(default=None, min_length=1)
    body: str | None = Field(default=None, min_length=1)
    category: FeedCategory | None = None
    image_path: str | None = None

    @model_validator(mode="after")
    def _reject_explicit_nulls(self) -> "FeedPostUpdateRequest":
        """`image_path` is the only field where null means something.

        These three are typed `X | None` purely to express "may be omitted",
        and `min_length` does not constrain the None arm -- so without this an
        explicit `{"title": null}` passes validation, reaches a NOT NULL
        column, and surfaces as an unhandled IntegrityError rather than a 422.
        The zod contract already refuses null here, so this also stops the
        server and the published schema disagreeing.
        """
        nulled = [
            field
            for field in ("title", "body", "category")
            if field in self.model_fields_set and getattr(self, field) is None
        ]
        if nulled:
            raise ValueError(f"{', '.join(nulled)} cannot be null")
        return self


class FeedImageUploadUrlRequest(BaseModel):
    """`size_bytes` is client-declared and therefore advisory -- it buys an
    early, clearer 422 rather than a failed upload. The bucket's own
    file_size_limit is what a client holding the signed URL cannot bypass."""

    mime_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int


class FeedImageUploadUrlResponse(BaseModel):
    """Same shape as documents' UploadUrlResponse, so both clients reuse the
    uploadToSignedUrl flow they already have."""

    storage_path: str
    token: str
