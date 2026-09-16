from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    order_index: int
    chapter_count: int
    created_at: datetime


class BookCreateRequest(BaseModel):
    title: str
