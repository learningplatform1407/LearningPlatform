from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.questions.schemas import (
    ImportRequest,
    ImportResult,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
    TagResponse,
)
from app.questions.service import (
    archive_question,
    create_question,
    get_question,
    import_questions,
    list_questions,
    list_tags,
    update_question,
)

router = APIRouter(prefix="/v1/questions", tags=["questions"])
tags_router = APIRouter(prefix="/v1/tags", tags=["questions"])


@router.get("", response_model=list[QuestionResponse])
def read_questions(
    status: str | None = None,
    tag_id: UUID | None = None,
    document_id: UUID | None = None,
    # Bounded here, not in the service: SQLite silently reads a negative
    # LIMIT as "no limit" while Postgres rejects it outright, so an
    # unbounded param passes the test suite and 500s in production.
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[QuestionResponse]:
    questions = list_questions(
        db, status=status, tag_id=tag_id, document_id=document_id, limit=limit, offset=offset
    )
    return [QuestionResponse.model_validate(q) for q in questions]


@router.post("", response_model=QuestionResponse)
def create_question_route(
    data: QuestionCreateRequest,
    admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    question = create_question(db, admin.id, data)
    return QuestionResponse.model_validate(question)


@router.get("/{question_id}", response_model=QuestionResponse)
def read_question(
    question_id: UUID,
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    question = get_question(db, question_id)
    if question is None:
        raise ApiError(404, "not_found", "Question not found")
    return QuestionResponse.model_validate(question)


@router.patch("/{question_id}", response_model=QuestionResponse)
def update_question_route(
    question_id: UUID,
    data: QuestionUpdateRequest,
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    question = update_question(db, question_id, data)
    return QuestionResponse.model_validate(question)


@router.delete("/{question_id}", response_model=QuestionResponse)
def archive_question_route(
    question_id: UUID,
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    question = archive_question(db, question_id)
    return QuestionResponse.model_validate(question)


@router.post("/import", response_model=ImportResult)
def import_questions_route(
    data: ImportRequest,
    dry_run: bool = False,
    admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ImportResult:
    return import_questions(db, admin.id, data, dry_run=dry_run)


@tags_router.get("", response_model=list[TagResponse])
def read_tags(
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TagResponse]:
    return [
        TagResponse(id=tag.id, slug=tag.slug, label=tag.label, question_count=count)
        for tag, count in list_tags(db)
    ]
