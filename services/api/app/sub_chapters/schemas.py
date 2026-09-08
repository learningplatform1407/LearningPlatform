from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SubChapterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chapter_id: UUID
    title: str
    order_index: int
    lesson_count: int
    created_at: datetime


class SubChapterCreateRequest(BaseModel):
    title: str
