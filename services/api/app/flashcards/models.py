import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.flashcards.constants import FlashcardStatus


class Flashcard(Base):
    """One front/back card bound to a lesson.

    A flashcard owns its own text rather than pointing at a Question: the
    question bank is exam material, and reusing it here would mean every
    answer key was readable by anyone studying the lecture. See
    docs/architecture/flashcards.md.

    `scope` carries the provenance axis (official vs personal) and is what
    every read path filters on -- see FlashcardScope for why it is stored
    rather than derived from the author's role.

    `created_by` is CASCADE on profiles, consistent with every other content
    table (questions, books, chapters, sub_chapters, documents). That means
    deleting a profile deletes the cards it authored, which is right for a
    personal card and wrong for an official one -- a repo-wide problem tracked
    as its own HARDEN ticket rather than patched on this one table.
    """

    __tablename__ = "flashcards"
    __table_args__ = (
        # The deck draw and the lesson list both filter on exactly this
        # triple, so it is worth the index even on a small table.
        Index("ix_flashcards_document_scope_status", "document_id", "scope", "status"),
        Index("ix_flashcards_created_by_scope", "created_by", "scope"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    # The idempotency key for the admin import, exactly as questions.external_id
    # is. NULL for personal cards, which are never imported.
    external_id: Mapped[str | None] = mapped_column(String, unique=True, default=None)
    scope: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default=FlashcardStatus.PUBLISHED)
    front_text: Mapped[str] = mapped_column(String)
    back_text: Mapped[str] = mapped_column(String)
    # Orders the management list only -- never the deck, which is due-first
    # then random so the scheduler, not the author, decides what you see.
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FlashcardReviewState(Base):
    """One user's SM-2 progress against one Flashcard -- created lazily on
    that user's first grade of the card, never pre-created at import time, so
    a row's absence is exactly what "new" means.

    Deliberately separate from cloze_review_states rather than a shared
    polymorphic table: the two features own their own content tables, and the
    only thing worth sharing is the scheduling math in app/srs/scheduler.py.
    One table covers official and personal cards alike, so the All/Official/
    Mine toggle narrows the view without splitting the schedule.
    """

    __tablename__ = "flashcard_review_states"
    __table_args__ = (
        UniqueConstraint("user_id", "flashcard_id", name="uq_flashcard_review_states_user_card"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    flashcard_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flashcards.id", ondelete="CASCADE"))
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
