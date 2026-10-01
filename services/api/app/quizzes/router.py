from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.questions.service import resolve_topic_documents
from app.quizzes.schemas import (
    AnswerRequest,
    AnswerSavedResponse,
    AvailableCountResponse,
    QuestionResultResponse,
    QuizSessionCreateRequest,
    QuizSessionHistoryItem,
    QuizSessionResponse,
    QuizSessionResultsResponse,
)
from app.quizzes.service import (
    answer_question,
    available_count,
    cancel_session,
    get_current_session,
    get_results,
    get_session,
    list_history,
    pause_session,
    resume_session,
    start_session,
    submit_session,
)
from app.users.service import get_or_create_profile

router = APIRouter(prefix="/v1/quiz-sessions", tags=["quiz-sessions"])


@router.get("/current", response_model=QuizSessionResponse | None)
def read_current_session(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse | None:
    return get_current_session(db, user.id)


@router.get("/available-count", response_model=AvailableCountResponse)
def read_available_count(
    chapter_ids: list[UUID] = Query(default_factory=list),
    sub_chapter_ids: list[UUID] = Query(default_factory=list),
    document_ids: list[UUID] = Query(default_factory=list),
    tag_ids: list[UUID] = Query(default_factory=list),
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailableCountResponse:
    resolved = resolve_topic_documents(
        db, chapter_ids=chapter_ids, sub_chapter_ids=sub_chapter_ids, document_ids=document_ids
    )
    count = available_count(db, document_ids=resolved, tag_ids=tag_ids)
    return AvailableCountResponse(available=count)


@router.get("", response_model=list[QuizSessionHistoryItem])
def read_history(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuizSessionHistoryItem]:
    return list_history(db, user.id)


@router.post("", response_model=QuizSessionResponse)
def create_session(
    data: QuizSessionCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse:
    # A user can reach this before ever calling GET /v1/me — same
    # FK-ordering trap as annotations/notebook/lesson_views.
    profile = get_or_create_profile(db, user)
    return start_session(db, profile.id, data)


@router.get("/{session_id}", response_model=QuizSessionResponse)
def read_session(
    session_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse:
    return get_session(db, session_id, user.id)


@router.put("/{session_id}/answers/{position}", response_model=None)
def answer_session_question(
    session_id: UUID,
    position: int,
    data: AnswerRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnswerSavedResponse | QuestionResultResponse:
    return answer_question(db, session_id, user.id, position, data)


@router.post("/{session_id}/pause", response_model=QuizSessionResponse)
def pause_session_route(
    session_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse:
    return pause_session(db, session_id, user.id)


@router.post("/{session_id}/resume", response_model=QuizSessionResponse)
def resume_session_route(
    session_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse:
    return resume_session(db, session_id, user.id)


@router.post("/{session_id}/cancel", response_model=QuizSessionResponse)
def cancel_session_route(
    session_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse:
    return cancel_session(db, session_id, user.id)


@router.post("/{session_id}/submit", response_model=QuizSessionResponse)
def submit_session_route(
    session_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse:
    return submit_session(db, session_id, user.id)


@router.get("/{session_id}/results", response_model=QuizSessionResultsResponse)
def read_results(
    session_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResultsResponse:
    return get_results(db, session_id, user.id)
