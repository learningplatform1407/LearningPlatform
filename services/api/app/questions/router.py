from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.progress.schemas import BankTreeResponse
from app.progress.service import get_bank_tree, get_progress_for_questions, grade_and_record
from app.questions.grading import build_reveal, validate_selection
from app.questions.models import Question
from app.questions.schemas import (
    BankAnswerRequest,
    ImportRequest,
    ImportResult,
    OptionSchema,
    QuestionBankItem,
    QuestionBankTag,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionRevealResponse,
    QuestionUpdateRequest,
    TagResponse,
)
from app.questions.scoring import get_scheme
from app.questions.service import (
    apply_published_filter,
    archive_question,
    create_question,
    get_question,
    import_questions,
    list_published_questions,
    list_questions,
    list_tags,
    resolve_topic_documents,
    update_question,
)
from app.users.service import get_or_create_profile

router = APIRouter(prefix="/v1/questions", tags=["questions"])
tags_router = APIRouter(prefix="/v1/tags", tags=["questions"])
# Separate router, not another route on `router` above: every route there is
# require_admin, and this one deliberately is not. Keeping it out of that
# grouping means a student-reachable route can't drift under the admin
# prefix by accident. Same shape as tags_router.
bank_router = APIRouter(prefix="/v1/question-bank", tags=["questions"])


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


@bank_router.get("", response_model=list[QuestionBankItem])
def read_question_bank(
    chapter_ids: list[UUID] = Query(default_factory=list),
    sub_chapter_ids: list[UUID] = Query(default_factory=list),
    document_ids: list[UUID] = Query(default_factory=list),
    tag_ids: list[UUID] = Query(default_factory=list),
    unassigned: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuestionBankItem]:
    """Browse the published pool without starting a session.

    Topics OR together and expand to lessons; tags AND. The lesson reader
    passes `document_ids=<lesson>` to show just that lesson's questions.

    Each item carries the caller's own progress so both browse surfaces can
    mark what has already been answered without a request per question.
    """
    resolved = resolve_topic_documents(
        db, chapter_ids=chapter_ids, sub_chapter_ids=sub_chapter_ids, document_ids=document_ids
    )
    questions, tags_by_question = list_published_questions(
        db,
        document_ids=resolved,
        tag_ids=tag_ids,
        limit=limit,
        offset=offset,
        unassigned=unassigned,
    )
    progress = get_progress_for_questions(db, user.id, [question.id for question in questions])
    return [
        QuestionBankItem(
            id=question.id,
            prompt=question.prompt,
            kind=question.kind,
            difficulty=question.difficulty,
            points_possible=get_scheme(question.scoring_scheme).max_points,
            document_id=question.document_id,
            options=[OptionSchema(**option) for option in question.options],
            tags=[
                QuestionBankTag(id=tag.id, slug=tag.slug, label=tag.label)
                for tag in tags_by_question.get(question.id, [])
            ],
            progress=progress.get(question.id),
        )
        for question in questions
    ]


@bank_router.get("/tree", response_model=BankTreeResponse)
def read_bank_tree(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankTreeResponse:
    """The content hierarchy with per-node question and progress counts.

    Declared before `/{question_id}/answers` so "tree" is matched as a
    literal path rather than parsed as a question id.
    """
    return get_bank_tree(db, user.id)


@bank_router.post("/{question_id}/answers", response_model=QuestionRevealResponse)
def answer_bank_question(
    question_id: UUID,
    data: BankAnswerRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionRevealResponse:
    """Answer a question straight from the bank, outside any session.

    POST rather than PUT: each call is a new attempt and moves
    `attempt_count`. Unlike an `immediate` session answer this is repeatable
    — the bank is for study, not assessment.
    """
    # Fetched through the published filter, not by primary key: a draft or
    # archived question must 404 rather than hand back its answer key.
    question = db.scalar(
        apply_published_filter(select(Question), document_ids=None, tag_ids=[]).where(
            Question.id == question_id
        )
    )
    if question is None:
        raise ApiError(404, "not_found", "Question not found")

    selected = validate_selection(question, data.selected_option_ids, require_answer=True)
    # The profiles FK trap: a user can reach this before ever calling
    # GET /v1/me, and question_progress.user_id references profiles.id.
    profile = get_or_create_profile(db, user)
    points_possible = get_scheme(question.scoring_scheme).max_points
    points, outcome = grade_and_record(
        db,
        user_id=profile.id,
        question=question,
        scoring_scheme=question.scoring_scheme,
        points_possible=points_possible,
        selected_option_ids=selected,
        now=datetime.now(UTC),
    )
    db.commit()
    return build_reveal(
        question,
        selected_option_ids=selected,
        points_awarded=points,
        points_possible=points_possible,
        outcome=outcome,
    )


@tags_router.get("", response_model=list[TagResponse])
def read_tags(
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TagResponse]:
    return [
        TagResponse(id=tag.id, slug=tag.slug, label=tag.label, question_count=count)
        for tag, count in list_tags(db)
    ]
