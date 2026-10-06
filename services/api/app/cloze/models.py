import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.srs.scheduler import DEFAULT_EASE_FACTOR


class ClozeCard(Base):
    """A single hidden word/sequence within a lesson paragraph, auto-generated
    by app/cloze/generation.py -- canonical content shared by every user,
    the same way Quiz/Flashcard are. Per-user spaced-repetition progress
    against a card lives separately in ClozeReviewState."""

    __tablename__ = "cloze_cards"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    block_index: Mapped[int] = mapped_column(Integer)
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    answer_text: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClozeReviewState(Base):
    """One user's SM-2 progress against one ClozeCard -- created lazily on
    that user's first review of the card, not pre-created for every user at
    generation time."""

    __tablename__ = "cloze_review_states"
    __table_args__ = (
        UniqueConstraint("user_id", "cloze_card_id", name="uq_cloze_review_states_user_card"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    cloze_card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cloze_cards.id", ondelete="CASCADE")
    )
    ease_factor: Mapped[float] = mapped_column(Float, default=DEFAULT_EASE_FACTOR)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
