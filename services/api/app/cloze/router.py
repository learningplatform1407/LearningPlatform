from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.cloze.schemas import (
    ClozeCardCreateRequest,
    ClozeCardResponse,
    ClozeDueCardResponse,
    ClozeRatingRequest,
    ClozeReviewStateResponse,
)
from app.cloze.service import (
    create_cloze_card,
    delete_cloze_card,
    list_cloze_cards,
    list_due_cloze_cards_with_state,
    submit_cloze_review,
)
from app.common.errors import ApiError
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.documents.models import Document
from app.documents.service import get_document
from app.srs.scheduler import preview_intervals, state_of
from app.srs.schemas import NextIntervalsResponse
from app.users.service import get_or_create_profile

router = APIRouter(prefix="/v1/documents/{document_id}/cloze-cards", tags=["cloze"])


def _get_document_or_404(db: Session, document_id: UUID) -> Document:
    document = get_document(db, document_id)
    if document is None:
        raise ApiError(404, "not_found", "Document not found")
    return document


@router.get("", response_model=list[ClozeCardResponse])
def read_cloze_cards(
    document_id: UUID,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClozeCardResponse]:
    document = _get_document_or_404(db, document_id)
    return [ClozeCardResponse.model_validate(c) for c in list_cloze_cards(db, document)]


@router.post("", response_model=ClozeCardResponse, status_code=201)
def create_cloze_card_route(
    document_id: UUID,
    data: ClozeCardCreateRequest,
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ClozeCardResponse:
    """Admin-only: which words the Review tab hides is authored, not guessed.

    This replaced a heuristic that marked the first two long non-stopwords of
    every paragraph, which made Review a quiz on whichever words happened to
    be longest rather than on what the lesson is teaching.
    """
    document = _get_document_or_404(db, document_id)
    return ClozeCardResponse.model_validate(create_cloze_card(db, document, data))


@router.delete("/{cloze_card_id}", status_code=204)
def delete_cloze_card_route(
    document_id: UUID,
    cloze_card_id: UUID,
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    document = _get_document_or_404(db, document_id)
    delete_cloze_card(db, document, cloze_card_id)


@router.get("/due", response_model=list[ClozeDueCardResponse])
def read_due_cloze_cards(
    document_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClozeDueCardResponse]:
    document = _get_document_or_404(db, document_id)
    return [
        ClozeDueCardResponse(
            **ClozeCardResponse.model_validate(card).model_dump(),
            next_intervals=NextIntervalsResponse.of(preview_intervals(state_of(state))),
        )
        for card, state in list_due_cloze_cards_with_state(db, document, user.id)
    ]


@router.post("/{cloze_card_id}/review", response_model=ClozeReviewStateResponse)
def submit_cloze_review_route(
    document_id: UUID,
    cloze_card_id: UUID,
    data: ClozeRatingRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClozeReviewStateResponse:
    _get_document_or_404(db, document_id)  # 404s a bad document_id before touching the card
    # Same FK-ordering guard as notebook/annotations: a user could hit this
    # before ever calling GET /v1/me, which is what normally creates the
    # profile row ClozeReviewState needs to FK against.
    profile = get_or_create_profile(db, user)
    state = submit_cloze_review(db, cloze_card_id, profile.id, data.rating)
    return ClozeReviewStateResponse.model_validate(state)
