from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ChapterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    order_index: int
    lesson_count: int
    created_at: datetime


class ChapterCreateRequest(BaseModel):
    title: str
