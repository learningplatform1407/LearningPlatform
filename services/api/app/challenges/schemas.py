from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.activity.schemas import ActivityActorResponse
from app.challenges.constants import ChallengeStatus


class ChallengeCreateRequest(BaseModel):
    session_id: UUID
    user_id: UUID


class ChallengeQuestionResult(BaseModel):
    position: int
    your_outcome: str | None
    opponent_outcome: str | None


class ChallengeResponse(BaseModel):
    """A challenge from the caller's side of it. The opponent's score and the
    per-question comparison stay null until both have finished, so the
    challengee can't see what they're up against before they answer."""

    id: UUID
    status: ChallengeStatus
    direction: Literal["incoming", "sent"]
    opponent: ActivityActorResponse
    question_count: int
    duration_seconds: int | None
    created_at: datetime
    expires_at: datetime
    completed_at: datetime | None
    your_session_id: UUID | None
    your_score_percent: float | None
    opponent_score_percent: float | None
    questions: list[ChallengeQuestionResult] | None
