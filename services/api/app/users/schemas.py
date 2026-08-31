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
