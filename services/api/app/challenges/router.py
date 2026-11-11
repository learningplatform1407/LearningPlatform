from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.challenges.schemas import ChallengeCreateRequest, ChallengeResponse
from app.challenges.service import (
    accept_challenge,
    create_challenge,
    decline_challenge,
    get_challenge,
    list_challenges,
)
from app.db.session import get_db
from app.quizzes.schemas import QuizSessionResponse

router = APIRouter(prefix="/v1", tags=["challenges"])


@router.post("/challenges", response_model=ChallengeResponse)
def send_challenge(
    data: ChallengeCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChallengeResponse:
    return create_challenge(db, user.id, data)


@router.get("/me/challenges", response_model=list[ChallengeResponse])
def read_my_challenges(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChallengeResponse]:
    """Sent and received, newest first."""
    return list_challenges(db, user.id)


@router.get("/challenges/{challenge_id}", response_model=ChallengeResponse)
def read_challenge(
    challenge_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChallengeResponse:
    return get_challenge(db, challenge_id, user.id)


@router.post("/challenges/{challenge_id}/accept", response_model=QuizSessionResponse)
def accept(
    challenge_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSessionResponse:
    return accept_challenge(db, challenge_id, user.id)


@router.post("/challenges/{challenge_id}/decline", response_model=ChallengeResponse)
def decline(
    challenge_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChallengeResponse:
    return decline_challenge(db, challenge_id, user.id)
