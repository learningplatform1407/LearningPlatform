from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.users.schemas import ProfileStatsResponse


class UserSummaryResponse(BaseModel):
    """Another learner as a row in search results and follow lists. The
    relationship flags are always from the caller's point of view."""

    id: UUID
    display_name: str | None
    avatar_url: str | None
    university: str | None
    is_following: bool
    follows_you: bool


class PublicProfileResponse(UserSummaryResponse):
    created_at: datetime
    followers_count: int
    following_count: int
    stats: ProfileStatsResponse
