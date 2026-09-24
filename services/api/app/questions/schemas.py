from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class OptionSchema(BaseModel):
    id: str
    text: str


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_id: str | None
    document_id: UUID | None
    prompt: str
    kind: Literal["single", "multi"]
    scoring_scheme: str
    options: list[OptionSchema]
    correct_option_ids: list[str]
    rationales: dict[str, str]
    explanation: str | None
    difficulty: Literal["easy", "medium", "hard"]
    status: Literal["draft", "published", "archived"]
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class QuestionCreateRequest(BaseModel):
    external_id: str | None = None
    document_id: UUID | None = None
    prompt: str
    kind: Literal["single", "multi"]
    scoring_scheme: str
    options: list[OptionSchema]
    correct_option_ids: list[str]
    rationales: dict[str, str] = Field(default_factory=dict)
    explanation: str | None = None
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    status: Literal["draft", "published", "archived"] = "draft"
    tags: list[str] = Field(default_factory=list)

    @field_validator("external_id")
    @classmethod
    def _blank_external_id_is_absent(cls, value: str | None) -> str | None:
        # "" and None both mean "no external_id" to a CSV/export-style
        # import, but the column is unique. Without this, two items each
        # carrying external_id="" would both look up as "no match" (Python
        # truthiness) yet both insert the literal '' value, and the second
        # one's flush would violate the unique constraint.
        return value or None


class QuestionUpdateRequest(BaseModel):
    document_id: UUID | None = None
    prompt: str | None = None
    kind: Literal["single", "multi"] | None = None
    scoring_scheme: str | None = None
    options: list[OptionSchema] | None = None
    correct_option_ids: list[str] | None = None
    rationales: dict[str, str] | None = None
    explanation: str | None = None
    difficulty: Literal["easy", "medium", "hard"] | None = None
    status: Literal["draft", "published", "archived"] | None = None
    tags: list[str] | None = None


class TagResponse(BaseModel):
    id: UUID
    slug: str
    label: str
    question_count: int


class ImportQuestionItem(QuestionCreateRequest):
    pass


class ImportRequest(BaseModel):
    allow_new_tags: bool = False
    questions: list[ImportQuestionItem]


class ImportErrorItem(BaseModel):
    index: int
    field: str
    message: str


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[ImportErrorItem]
