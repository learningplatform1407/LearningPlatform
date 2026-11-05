from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_version_id: UUID
    type: Literal["highlight", "margin_note"]
    block_index: int
    start_offset: int | None
    end_offset: int | None
    note_text: str | None
    color: str | None
    created_at: datetime


class AnnotationCreateRequest(BaseModel):
    type: Literal["highlight", "margin_note"]
    block_index: int
    start_offset: int | None = None
    end_offset: int | None = None
    note_text: str | None = None
    color: str | None = None


class AnnotationUpdateRequest(BaseModel):
    """Edits in place, so a note keeps its id and creation time (it used to be
    deleted and recreated). Only the fields sent are changed: `note_text` on a
    margin note, `color` on a highlight. The anchor never moves -- a note on
    a different passage is a different note."""

    note_text: str | None = None
    color: str | None = None
