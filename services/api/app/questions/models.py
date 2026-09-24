import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Question(Base):
    """One entry in the question bank. `options` holds only `{id, text}` and
    is safe to return verbatim to a student mid-quiz — the answer key
    (`correct_option_ids`, `rationales`) lives in separate columns so there
    is no response model that could accidentally ship it early."""

    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str | None] = mapped_column(String, unique=True, default=None)
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), default=None
    )
    prompt: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)
    scoring_scheme: Mapped[str] = mapped_column(String)
    options: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    correct_option_ids: Mapped[list[str]] = mapped_column(JSON)
    rationales: Mapped[dict[str, str]] = mapped_column(JSON)
    explanation: Mapped[str | None] = mapped_column(String, default=None)
    difficulty: Mapped[str] = mapped_column(String, default="medium")
    status: Mapped[str] = mapped_column(String, default="draft")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String, unique=True)
    label: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class QuestionTag(Base):
    """Junction table. The PK `(question_id, tag_id)` serves "what tags does
    this question have"; the sampler's subquery asks the opposite —"which
    questions carry any of these tags" — filtering on `tag_id`, the PK's
    non-leading column. A btree can't seek on that, so the second index
    below is what makes the sampling subquery an index-only scan instead of
    a full scan of the PK index."""

    __tablename__ = "question_tags"
    __table_args__ = (Index("ix_question_tags_tag_id_question_id", "tag_id", "question_id"),)

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
