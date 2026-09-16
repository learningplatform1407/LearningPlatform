from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class StrokePoint(BaseModel):
    x: float
    y: float
    pressure: float | None = None


class Stroke(BaseModel):
    color: str
    width: float
    points: list[StrokePoint]


class NotebookEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: Literal["text", "drawing"]
    content: str | None
    strokes: list[Stroke] | None
    created_at: datetime
    updated_at: datetime


class NotebookEntryCreateRequest(BaseModel):
    type: Literal["text", "drawing"]
    content: str | None = None
    strokes: list[Stroke] | None = None


class NotebookEntryUpdateRequest(BaseModel):
    content: str | None = None
    strokes: list[Stroke] | None = None
