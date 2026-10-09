from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.flashcards.constants import FlashcardScope, FlashcardStatus
from app.srs.scheduler import ReviewRating


class FlashcardResponse(BaseModel):
    """A card as the management list shows it. `is_mine` and `suspended` are
    both computed per caller rather than stored on the card: the first so the
    UI can offer edit/delete without re-deriving ownership from created_by
    (which it never sees), the second because suspension is one learner's
    choice about a possibly-shared card."""

    id: UUID
    document_id: UUID
    front_text: str
    back_text: str
    scope: FlashcardScope
    status: FlashcardStatus
    order_index: int
    is_mine: bool
    suspended: bool
    # Computed server-side rather than re-derived by each client, because
    # `is_mine` alone is the wrong test and getting it wrong is invisible
    # until a button 404s. An admin who imported an official card *did*
    # create it, so is_mine is true, but official cards are not editable;
    # conversely any admin may retire one, including one they did not import.
    can_edit: bool
    can_delete: bool


class FlashcardCardResponse(BaseModel):
    """A card as the deck runner receives it.

    Carries `back_text` up front: unlike a question, a flashcard's back is
    not an answer key, so there is nothing to withhold and the reveal needs
    no second request. The client simply doesn't render it until tapped.
    """

    id: UUID
    document_id: UUID
    front_text: str
    back_text: str
    scope: FlashcardScope
    is_mine: bool
    # Null for a card never graded by this user -- which is also what is_new
    # reports. Both are present because the hub counts them separately.
    due_at: datetime | None
    is_new: bool


class FlashcardCreateRequest(BaseModel):
    """Note the absence of `scope`: a learner-created card is always personal,
    decided by the endpoint rather than the payload. See FlashcardScope."""

    front_text: str = Field(min_length=1)
    back_text: str = Field(min_length=1)


class FlashcardUpdateRequest(BaseModel):
    front_text: str | None = Field(default=None, min_length=1)
    back_text: str | None = Field(default=None, min_length=1)


class FlashcardRatingRequest(BaseModel):
    rating: ReviewRating


class FlashcardSuspensionRequest(BaseModel):
    """One field, set rather than toggled, so the request is idempotent and a
    double-tap or a retry can't flip the card back by accident."""

    suspended: bool


class FlashcardReviewStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    flashcard_id: UUID
    ease_factor: float
    interval_days: int
    repetitions: int
    suspended: bool
    due_at: datetime
    last_reviewed_at: datetime | None


class ImportFlashcardItem(BaseModel):
    """One card in an admin bulk import. `external_id` is the upsert key, so
    re-importing the same payload updates rather than duplicating."""

    external_id: str = Field(min_length=1)
    document_id: UUID
    front_text: str = Field(min_length=1)
    back_text: str = Field(min_length=1)
    order_index: int = 0
    status: FlashcardStatus = FlashcardStatus.PUBLISHED


class FlashcardImportRequest(BaseModel):
    flashcards: list[ImportFlashcardItem]


class ImportErrorItem(BaseModel):
    index: int
    field: str
    message: str


class FlashcardImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[ImportErrorItem]


class FlashcardSummaryLesson(BaseModel):
    id: UUID
    title: str
    due_count: int
    new_count: int


class FlashcardSummarySubChapter(BaseModel):
    id: UUID
    title: str
    due_count: int
    new_count: int
    lessons: list[FlashcardSummaryLesson]


class FlashcardSummaryChapter(BaseModel):
    id: UUID
    title: str
    due_count: int
    new_count: int
    sub_chapters: list[FlashcardSummarySubChapter]


class FlashcardSummaryBook(BaseModel):
    id: UUID
    title: str
    due_count: int
    new_count: int
    chapters: list[FlashcardSummaryChapter]


class FlashcardSummaryResponse(BaseModel):
    books: list[FlashcardSummaryBook]
    uncategorized_lessons: list[FlashcardSummaryLesson]
