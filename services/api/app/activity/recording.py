import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.activity.constants import STREAK_MILESTONES, ActivityKind
from app.activity.models import ActivityEvent

# Imported by quizzes, progress and daily to record events as they happen, so
# it depends on nothing but its own model: reading the feed (app/activity/feed.py)
# needs app.social, which reaches back into those modules for profile stats.


def record_event(
    db: Session,
    *,
    user_id: uuid.UUID,
    kind: ActivityKind,
    now: datetime,
    subject_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Adds one event to the caller's transaction, once per subject. Never
    commits and never raises for a duplicate: the action it describes has
    already happened, and a missing feed line must not undo it."""
    if subject_id is not None:
        exists = db.scalar(
            select(ActivityEvent.id).where(
                ActivityEvent.user_id == user_id,
                ActivityEvent.kind == kind,
                ActivityEvent.subject_id == subject_id,
            )
        )
        if exists is not None:
            return
    savepoint = db.begin_nested()
    try:
        db.add(
            ActivityEvent(
                user_id=user_id,
                kind=kind,
                subject_id=subject_id,
                payload=payload or {},
                created_at=now,
            )
        )
        db.flush()
    except IntegrityError:
        # Two requests finishing the same exam at once; the other one wrote it.
        savepoint.rollback()
    else:
        savepoint.commit()


def is_streak_milestone(days: int) -> bool:
    return days in STREAK_MILESTONES or (days > STREAK_MILESTONES[-1] and days % 100 == 0)
