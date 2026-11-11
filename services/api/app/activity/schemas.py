from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.activity.constants import ActivityKind


class ActivityActorResponse(BaseModel):
    id: UUID
    display_name: str | None
    avatar_url: str | None


class ActivityEventResponse(BaseModel):
    """One feed line. Flat rather than one model per kind: each kind fills
    the fields it needs and leaves the rest null, and the clients switch on
    `kind` to build the sentence in the reader's language."""

    id: UUID
    kind: ActivityKind
    created_at: datetime
    user: ActivityActorResponse
    # lesson_completed. The title is read now, so a renamed lesson shows its
    # current name.
    document_id: UUID | None = None
    document_title: str | None = None
    # exam_completed
    score_percent: float | None = None
    question_count: int | None = None
    # streak_milestone
    streak_days: int | None = None
    # challenge_completed; `score_percent` is the author's own.
    opponent: ActivityActorResponse | None = None
    opponent_score_percent: float | None = None
