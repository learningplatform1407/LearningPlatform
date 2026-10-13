import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyQuestion(Base):
    """Which question a given calendar day asks. One row per day.

    `for_date` is the first Date column in this schema -- everything else is
    DateTime(timezone=True), because everything else reasons about instants. A
    day only exists relative to a timezone, and that conversion happens once,
    in app/core/clock.py, so this column holds an institution-local date.

    Rows are created lazily by the first reader of a day rather than by a
    scheduler, which does not exist. That is the house pattern rather than a
    workaround -- see docs/architecture/quizzes.md on lazy expiry: correctness
    never depends on a job having run. A row for a *future* date exists only
    when an admin pre-booked it.

    `question_id` is RESTRICT, not CASCADE. Questions are archived rather than
    deleted, but if one ever were, cascading would erase a day people had
    already answered, and their scores with it.
    """

    __tablename__ = "daily_questions"
    __table_args__ = (
        # Redundant against the primary key, and present so the child table's
        # composite foreign key has a unique index to point at. That FK is
        # what makes "the day's question cannot change while attempts exist"
        # an invariant the database enforces rather than only an `if`.
        UniqueConstraint("for_date", "question_id", name="uq_daily_questions_date_question"),
    )

    for_date: Mapped[date] = mapped_column(Date, primary_key=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"))
    # Non-null means an admin chose this day's question rather than the random
    # draw. SET NULL so the record survives the admin's account, matching
    # feed_posts.author_id. Never exposed to students -- who picked the
    # question is not their business; see DailyQuestionResponse.
    selected_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DailyQuestionAttempt(Base):
    """One learner's answer to one day's question.

    Deliberately *not* written through to `question_progress`. That table is
    one row per (user, question) with latest-attempt-wins, so recording a
    daily answer there would silently overwrite a better earlier result from a
    real quiz -- and it has no date dimension, so it could not express "you
    answered on the 12th" anyway.

    The composite key is (user_id, for_date), mirroring QuestionProgress's
    shape, so "did I answer today" is one `db.get(..., (user_id, today))`.
    One attempt per day: a second submission returns the original result
    rather than re-grading.

    `points_awarded`/`points_possible`/`outcome` are stored rather than
    recomputed from the question. An admin editing the question later changes
    what a reveal *says* about which options were right, but it must not
    change what the learner actually scored.
    """

    __tablename__ = "daily_question_attempts"
    __table_args__ = (
        # Pins the attempt to the exact question the day was showing. The
        # database then refuses to re-point a day that already has answers,
        # which is the rule the admin override has to respect.
        ForeignKeyConstraint(
            ["for_date", "question_id"],
            ["daily_questions.for_date", "daily_questions.question_id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
            name="fk_daily_question_attempts_day",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    for_date: Mapped[date] = mapped_column(Date, primary_key=True)
    # No standalone FK to questions.id: the composite constraint above already
    # ties this to a real day-and-question pair, which is the stronger claim.
    question_id: Mapped[uuid.UUID] = mapped_column()
    selected_option_ids: Mapped[list[Any]] = mapped_column(JSON)
    points_awarded: Mapped[int] = mapped_column(Integer)
    points_possible: Mapped[int] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String)
    # Python-stamped rather than server_default, matching
    # question_progress.last_answered_at: SQLite's CURRENT_TIMESTAMP is
    # second-granularity and ties break ordering.
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
