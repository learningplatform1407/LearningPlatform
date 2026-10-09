import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.feed.constants import FeedCategory


class FeedPost(Base):
    """One admin-authored announcement: a title, a body, an optional picture.

    There is no `link_url`. A URL belongs in the body text the author is
    already writing -- a separate field means two places a link can live and
    an ambiguity every time you post. The clients linkify `https?://` matches
    in the body, that scheme only. When an embedded livestream player lands,
    extracting the first URL from the body is enough to start.

    There is no draft or archived status either. A post is published the
    moment it is created, so `published_at` is set by its server_default and
    deleting a post is a hard delete. Compare flashcards, which stage and
    retire official decks through a status column -- nothing holds review
    state against an announcement, so a pulled one should simply be gone.

    `published_at` is kept separate from `created_at` as the *editorial* date:
    it is what the list displays and sorts on, so scheduling can later become
    a UI change rather than a migration.
    """

    __tablename__ = "feed_posts"
    __table_args__ = (
        # Mirrors the constraint in 4b1d7ea3c602. Declared here too so
        # Base.metadata and the migration agree -- the SQLite suite builds from
        # the former, so a constraint living only in the migration is drift the
        # tests could never catch (the mistake ac4940c had to fix on
        # nullability). `questions.status` and `flashcards.scope` are bare
        # Strings; this is deliberately stricter, because changing the allowed
        # set needs a migration anyway to backfill existing rows.
        CheckConstraint("category IN ('news', 'media')", name="ck_feed_posts_category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String, default=FeedCategory.NEWS)
    # The Storage key inside the public feed-images bucket, never a URL.
    # profiles.avatar_url stores a full URL because the *client* builds it;
    # here the backend owns the write, so it keeps the key: rows stay portable
    # with no project ref baked in, the delete path has what it needs, and the
    # value can be validated against a pattern we minted -- so a post's image
    # cannot be pointed at an arbitrary third-party host.
    image_path: Mapped[str | None] = mapped_column(String, default=None)
    # SET NULL, not the CASCADE every other authored table uses. An
    # announcement is institutional and must outlive the admin who wrote it;
    # deleting a profile should not erase the notice history. There is no
    # migration cost in choosing this on a new table, and app/notebook's
    # source_document_id is the existing precedent for the shape. The seven
    # CASCADE `created_by` columns stay as they are, tracked under HARDEN-8.
    #
    # Every read path must outer-join profiles on this: an inner join would
    # silently hide exactly the posts this column exists to preserve.
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL"), default=None
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
