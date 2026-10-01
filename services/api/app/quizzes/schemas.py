from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.questions.schemas import QuestionRevealResponse


class QuizSessionCreateRequest(BaseModel):
    # `outcomes` (re-quiz from weak questions) is deferred to QUIZ-14, which
    # needs the `question_progress` table from QUIZ-12 — not built yet.
    #
    # question_count and duration_seconds are deliberately NOT bounded with
    # Field(ge=..., le=...): that reports out-of-range as Pydantic's
    # automatic 422 validation_error, and §7.2/§7.4 pin it as a 400
    # invalid_request carrying the offending field in `details`. The bounds
    # are enforced in the service instead (`_validate_bounds`).
    # Topic axis: any mix of levels, all OR-ed together and expanded to
    # lessons server-side. Tag axis: AND-ed (see apply_published_filter).
    chapter_ids: list[UUID] = Field(default_factory=list)
    sub_chapter_ids: list[UUID] = Field(default_factory=list)
    document_ids: list[UUID] = Field(default_factory=list)
    tag_ids: list[UUID] = Field(default_factory=list)
    question_count: int
    duration_seconds: int | None = None
    reveal_mode: Literal["immediate", "on_finish"]


class QuestionInSessionResponse(BaseModel):
    position: int
    prompt: str
    kind: Literal["single", "multi"]
    scoring_scheme: str
    points_possible: int
    options: list[dict[str, Any]]
    selected_option_ids: list[str] | None
    answered_at: datetime | None
    points_awarded: int | None
    outcome: Literal["correct", "partial", "incorrect"] | None


class QuizSessionResponse(BaseModel):
    id: UUID
    status: Literal["active", "paused", "completed", "expired", "cancelled"]
    reveal_mode: Literal["immediate", "on_finish"]
    question_count: int
    duration_seconds: int | None
    remaining_seconds: int | None
    server_time: datetime
    points_awarded: int | None
    points_possible: int | None
    finished_at: datetime | None
    questions: list[QuestionInSessionResponse]


class AnswerRequest(BaseModel):
    selected_option_ids: list[str] = Field(default_factory=list)


class AnswerSavedResponse(BaseModel):
    saved: bool = True


class QuestionResultResponse(QuestionRevealResponse):
    """The shared reveal plus the one thing only a session has: where the
    question sat in the frozen draw."""

    position: int


class QuizSessionResultsResponse(BaseModel):
    id: UUID
    status: Literal["completed", "expired", "cancelled"]
    reveal_mode: Literal["immediate", "on_finish"]
    points_awarded: int | None
    points_possible: int | None
    finished_at: datetime | None
    questions: list[QuestionResultResponse]


class QuizSessionHistoryItem(BaseModel):
    id: UUID
    status: Literal["active", "paused", "completed", "expired", "cancelled"]
    reveal_mode: Literal["immediate", "on_finish"]
    question_count: int
    points_awarded: int | None
    points_possible: int | None
    finished_at: datetime | None
    created_at: datetime


class AvailableCountResponse(BaseModel):
    available: int
