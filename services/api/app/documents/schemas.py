from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DocumentVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    error_message: str | None
    extracted_content: dict[str, Any] | None
    created_at: datetime


class ChapterSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str


class SubChapterSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    chapter: ChapterSummary


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    current_version: DocumentVersionResponse | None
    sub_chapter: SubChapterSummary | None = None


class DocumentSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_at: datetime
    status: str | None


class UploadUrlRequest(BaseModel):
    filename: str
    mime_type: Literal["application/pdf"]
    size_bytes: int


class UploadUrlResponse(BaseModel):
    storage_path: str
    token: str


class DocumentCreateRequest(BaseModel):
    title: str
    storage_path: str
    mime_type: Literal["application/pdf"]
    size_bytes: int
    checksum: str
    sub_chapter_id: UUID | None = None


class RecentLessonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_at: datetime
    status: str | None
    last_viewed_at: datetime


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: UUID
    content: str
    updated_at: datetime


class NoteUpsertRequest(BaseModel):
    content: str


class QuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    title: str
    created_at: datetime


class FlashcardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    front_text: str
    back_text: str
    order_index: int
