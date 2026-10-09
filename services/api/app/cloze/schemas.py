from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.srs.scheduler import ReviewRating


class ClozeCardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    block_index: int
    start_offset: int
    end_offset: int
    created_at: datetime


class ClozeRatingRequest(BaseModel):
    rating: ReviewRating


class ClozeReviewStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cloze_card_id: UUID
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime
    last_reviewed_at: datetime | None


class ReviewSummaryLesson(BaseModel):
    id: UUID
    title: str
    due_count: int


class ReviewSummarySubChapter(BaseModel):
    id: UUID
    title: str
    due_count: int
    lessons: list[ReviewSummaryLesson]


class ReviewSummaryChapter(BaseModel):
    id: UUID
    title: str
    due_count: int
    sub_chapters: list[ReviewSummarySubChapter]


class ReviewSummaryBook(BaseModel):
    id: UUID
    title: str
    due_count: int
    chapters: list[ReviewSummaryChapter]


class ReviewSummaryResponse(BaseModel):
    books: list[ReviewSummaryBook]
    uncategorized_lessons: list[ReviewSummaryLesson]
