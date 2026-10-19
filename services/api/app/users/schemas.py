from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AccountSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    theme: str
    notifications_enabled: bool
    language: str


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None
    display_name: str | None
    avatar_url: str | None
    university: str | None
    role: str
    created_at: datetime
    updated_at: datetime
    settings: AccountSettingsResponse


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    university: str | None = None
    theme: str | None = None
    notifications_enabled: bool | None = None
    language: str | None = None


class ProfileStatsResponse(BaseModel):
    """One round trip for the whole profile page. Composed in
    `read_my_stats` from a small counting/summing function per domain —
    see app/users/router.py. Percentages are computed here, server-side,
    rather than sent as raw counts for a client helper to derive: unlike
    BankTreeLesson's rollup, nothing in this response is recursive, so
    there's no shared-helper case to make."""

    current_streak_days: int
    longest_streak_days: int
    lessons_completed: int
    lessons_eligible: int
    exams_completed: int
    exam_average_score_percent: float | None
    questions_attempted: int
    questions_answered_lifetime: int
    question_accuracy_percent: float | None
