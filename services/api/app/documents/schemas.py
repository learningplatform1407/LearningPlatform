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
    book_id: UUID
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


# QuizResponse is gone with the `quizzes` table. FlashcardResponse moved to
# app/flashcards/schemas.py, where it carries the scope/status/is_mine fields
# the real feature needs.
