import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class QuestionProgress(Base):
    """One row per (user, question) — the user's current standing on it.

    **Latest attempt wins**: the row is overwritten on each answer, so it
    reflects current knowledge, which is what a revision view is for.
    `attempt_count` is kept because "you have tried this five times" is
    useful signal even though only the last outcome survives.

    This is a projection, not a source of truth — `quiz_session_questions`
    holds the full per-session record. It exists because a topic dashboard
    ("cardiology 40/200") would otherwise need a DISTINCT ON over every
    session the user has ever taken, joined to tags and grouped, on a screen
    loaded constantly. See docs/architecture/quizzes.md §5.5.

    It lives in its own module rather than under `quizzes` because answering
    a question straight from the bank writes here too, and the questions
    domain must not import the session domain.
    """

    __tablename__ = "question_progress"
    __table_args__ = (Index("ix_question_progress_user_outcome", "user_id", "outcome"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    outcome: Mapped[str] = mapped_column(String)
    points_awarded: Mapped[int] = mapped_column(Integer)
    points_possible: Mapped[int] = mapped_column(Integer)
    attempt_count: Mapped[int] = mapped_column(Integer, default=1)
    # Python-stamped, not server_default: SQLite's CURRENT_TIMESTAMP is
    # second-granularity and ties break ordering, the same reason
    # record_lesson_view timestamps in Python.
    last_answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
