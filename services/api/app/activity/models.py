import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ActivityEvent(Base):
    """Something a learner did that the people following them see: finished
    an exam, completed a lesson, reached a streak milestone.

    Written when it happens rather than derived on read. Lesson completion
    has no timestamp of its own (it's a ratio over question_progress), and
    rebuilding a feed from four tables for every learner you follow on every
    read would be the expensive way round. Recorded for everyone, shown only
    while the author is public (app/social/visibility.py), so going public
    shows recent history.

    `subject_id` is what the event is about -- the quiz session, the lesson --
    with no foreign key, so deleting a lesson doesn't need to reach in here;
    the reader drops events whose subject is gone. Together with the unique
    index it records each lesson completion and each exam once. Streak
    events have no subject, and NULLs never collide in a unique index.
    """

    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_events_user_id_created_at", "user_id", "created_at"),
        Index(
            "uq_activity_events_user_id_kind_subject_id",
            "user_id",
            "kind",
            "subject_id",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String)
    subject_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
