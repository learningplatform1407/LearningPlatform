import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class QuizSession(Base):
    """One attempt. Its PK is its own UUID, not `user_id` — keying it on the
    user (the `account_settings` pattern) would permit only one session per
    user in all of history. One-per-user only holds among *open* sessions,
    enforced by the partial unique index below, not by the primary key.

    There is no `started_at`: a session is created and started in the same
    request, so it would always equal `created_at`. `last_activity_at` is
    deliberately not `updated_at` — `updated_at` carries `onupdate=func.now()`
    so the sweeper's own writes would keep bumping it and the staleness rule
    would never fire. See docs/architecture/quizzes.md §5.3."""

    __tablename__ = "quiz_sessions"
    __table_args__ = (
        Index(
            "uq_quiz_sessions_one_open_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('active','paused')"),
            sqlite_where=text("status IN ('active','paused')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String, default="active")
    reveal_mode: Mapped[str] = mapped_column(String)
    filter_spec: Mapped[dict[str, Any]] = mapped_column(JSON)
    question_count: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, default=None)
    accumulated_seconds: Mapped[int] = mapped_column(Integer, default=0)
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    points_awarded: Mapped[int | None] = mapped_column(Integer, default=None)
    points_possible: Mapped[int | None] = mapped_column(Integer, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    questions: Mapped[list["QuizSessionQuestion"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="QuizSessionQuestion.position",
    )


class QuizSessionQuestion(Base):
    """The frozen, ordered draw — sampled once at session start. `question_id`
    is `ON DELETE RESTRICT`: a question referenced by any session (open or
    historical) can never be hard-deleted, only archived. `scoring_scheme`
    and `points_possible` are snapshotted at draw time rather than read
    through to the live question, so a future scheme change can never
    silently re-score a finished session. See docs/architecture/quizzes.md
    §5.4."""

    __tablename__ = "quiz_session_questions"
    __table_args__ = (
        UniqueConstraint("session_id", "position", name="uq_quiz_session_questions_position"),
        UniqueConstraint("session_id", "question_id", name="uq_quiz_session_questions_question"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="CASCADE")
    )
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"))
    position: Mapped[int] = mapped_column(Integer)
    scoring_scheme: Mapped[str] = mapped_column(String)
    points_possible: Mapped[int] = mapped_column(Integer)
    selected_option_ids: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    points_awarded: Mapped[int | None] = mapped_column(Integer, default=None)
    outcome: Mapped[str | None] = mapped_column(String, default=None)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    session: Mapped["QuizSession"] = relationship(back_populates="questions")
