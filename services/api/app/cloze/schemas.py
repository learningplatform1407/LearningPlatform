from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.srs.scheduler import ReviewRating
from app.srs.schemas import NextIntervalsResponse


class ClozeCardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    block_index: int
    start_offset: int
    end_offset: int
    created_at: datetime


class ClozeCardCreateRequest(BaseModel):
    """An admin marking one passage of one paragraph as a review word.

    Offsets only, no answer text: the server slices the answer out of the
    lesson itself (app/cloze/service.py::create_cloze_card), so a card can
    never disagree with the paragraph it points into.
    """

    block_index: int = Field(ge=0)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)

    @model_validator(mode="after")
    def _check_range(self) -> "ClozeCardCreateRequest":
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


class ClozeDueCardResponse(ClozeCardResponse):
    """A due card plus what each grade would schedule it for."""

    next_intervals: NextIntervalsResponse


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
