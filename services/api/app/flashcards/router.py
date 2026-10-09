from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.documents.service import get_document
from app.flashcards.constants import (
    DEFAULT_DECK_SIZE,
    MAX_DECK_SIZE,
    FlashcardScope,
    FlashcardStatus,
    ScopeFilter,
)
from app.flashcards.models import Flashcard, FlashcardReviewState
from app.flashcards.schemas import (
    FlashcardCardResponse,
    FlashcardCreateRequest,
    FlashcardImportRequest,
    FlashcardImportResult,
    FlashcardRatingRequest,
    FlashcardResponse,
    FlashcardReviewStateResponse,
    FlashcardSummaryResponse,
    FlashcardSuspensionRequest,
    FlashcardUpdateRequest,
)
from app.flashcards.service import (
    create_personal_card,
    delete_card,
    draw_lesson_deck,
    get_flashcard_summary,
    get_review_state,
    import_official_cards,
    list_lesson_cards,
    set_suspended,
    submit_flashcard_review,
    update_personal_card,
)
from app.users.constants import Role
from app.users.service import get_or_create_profile

# Lesson-scoped reads and personal authoring. Mounted under documents because
# a flashcard is always bound to exactly one lecture.
document_router = APIRouter(prefix="/v1/documents/{document_id}/flashcards", tags=["flashcards"])

# Card-scoped writes. Not nested under the document: the client holds a card
# id from the deck and shouldn't have to carry the lesson id to grade it.
router = APIRouter(prefix="/v1/flashcards", tags=["flashcards"])


def _to_response(
    card: Flashcard,
    user_id: UUID,
    state: FlashcardReviewState | None = None,
    *,
    is_admin: bool = False,
) -> FlashcardResponse:
    """`can_edit`/`can_delete` mirror `update_personal_card` and `delete_card`
    exactly. They are computed here, next to nothing, rather than inferred by
    the clients: both platforms previously gated their buttons on `is_mine`,
    which showed Edit on an admin's own imported official cards (the PATCH
    then 404'd) and hid Delete from any admin who had not imported them."""
    is_own_personal = card.scope == FlashcardScope.PERSONAL and card.created_by == user_id
    return FlashcardResponse(
        id=card.id,
        document_id=card.document_id,
        front_text=card.front_text,
        back_text=card.back_text,
        scope=FlashcardScope(card.scope),
        status=FlashcardStatus(card.status),
        order_index=card.order_index,
        is_mine=card.created_by == user_id,
        # No state row means the card has never been touched by this user,
        # which includes never having been suspended.
        suspended=state is not None and state.suspended,
        can_edit=is_own_personal,
        can_delete=is_own_personal or (card.scope == FlashcardScope.OFFICIAL and is_admin),
    )


def _require_document(db: Session, document_id: UUID) -> None:
    if get_document(db, document_id) is None:
        raise ApiError(404, "not_found", "Document not found")


@document_router.get("", response_model=list[FlashcardResponse])
def read_flashcards(
    document_id: UUID,
    scope: ScopeFilter = ScopeFilter.ALL,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FlashcardResponse]:
    _require_document(db, document_id)
    profile = get_or_create_profile(db, user)
    is_admin = profile.role == Role.ADMIN
    return [
        _to_response(card, profile.id, state, is_admin=is_admin)
        for card, state in list_lesson_cards(db, profile.id, document_id, scope)
    ]


@document_router.get("/due", response_model=list[FlashcardCardResponse])
def read_due_flashcards(
    document_id: UUID,
    scope: ScopeFilter = ScopeFilter.ALL,
    limit: int = Query(default=DEFAULT_DECK_SIZE, ge=1, le=MAX_DECK_SIZE),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FlashcardCardResponse]:
    _require_document(db, document_id)
    profile = get_or_create_profile(db, user)
    deck = draw_lesson_deck(db, profile.id, document_id, scope, limit)
    return [
        FlashcardCardResponse(
            id=card.id,
            document_id=card.document_id,
            front_text=card.front_text,
            back_text=card.back_text,
            scope=FlashcardScope(card.scope),
            is_mine=card.created_by == profile.id,
            due_at=state.due_at if state and state.last_reviewed_at is not None else None,
            is_new=state is None or state.last_reviewed_at is None,
        )
        for card, state in deck
    ]


@document_router.post("", response_model=FlashcardResponse, status_code=201)
def create_flashcard(
    document_id: UUID,
    data: FlashcardCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FlashcardResponse:
    """Always creates a personal card, whoever is calling -- an admin wanting
    official cards uses the importer. See FlashcardScope."""
    # Same FK-ordering guard as cloze/notebook/annotations: a learner could
    # reach this before ever calling GET /v1/me, which is what normally
    # creates the profile row flashcards.created_by FKs against.
    profile = get_or_create_profile(db, user)
    card = create_personal_card(db, profile.id, document_id, data.front_text, data.back_text)
    return _to_response(card, profile.id, is_admin=profile.role == Role.ADMIN)


@router.patch("/{flashcard_id}", response_model=FlashcardResponse)
def update_flashcard(
    flashcard_id: UUID,
    data: FlashcardUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FlashcardResponse:
    profile = get_or_create_profile(db, user)
    card = update_personal_card(db, profile.id, flashcard_id, data.front_text, data.back_text)
    # Passing the state matters: `suspended` is documented as computed per
    # caller, and omitting it would report every edited card as back in the
    # rotation regardless of whether the learner had excluded it.
    return _to_response(
        card,
        profile.id,
        get_review_state(db, profile.id, card.id),
        is_admin=profile.role == Role.ADMIN,
    )


@router.delete("/{flashcard_id}", status_code=204)
def delete_flashcard(
    flashcard_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Not gated on admin, because the common case is a learner removing
    their own card. The service decides: a personal card is hard-deleted by
    its owner, an official card is archived and only by an admin."""
    profile = get_or_create_profile(db, user)
    delete_card(db, profile.id, flashcard_id, is_admin=profile.role == Role.ADMIN)
    return Response(status_code=204)


@router.post("/{flashcard_id}/review", response_model=FlashcardReviewStateResponse)
def submit_flashcard_review_route(
    flashcard_id: UUID,
    data: FlashcardRatingRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FlashcardReviewStateResponse:
    profile = get_or_create_profile(db, user)
    state: FlashcardReviewState = submit_flashcard_review(db, profile.id, flashcard_id, data.rating)
    return FlashcardReviewStateResponse.model_validate(state)


@router.put("/{flashcard_id}/suspension", response_model=FlashcardReviewStateResponse)
def set_flashcard_suspension(
    flashcard_id: UUID,
    data: FlashcardSuspensionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FlashcardReviewStateResponse:
    """Takes a card out of the caller's rotation, or puts it back.

    PUT rather than POST, and a field rather than a toggle, so retrying is
    harmless. Not owner-gated: this writes the caller's own review state, not
    the card, so it applies to official cards too.
    """
    profile = get_or_create_profile(db, user)
    state = set_suspended(db, profile.id, flashcard_id, data.suspended)
    return FlashcardReviewStateResponse.model_validate(state)


@router.post("/import", response_model=FlashcardImportResult)
def import_flashcards_route(
    data: FlashcardImportRequest,
    dry_run: bool = False,
    admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> FlashcardImportResult:
    profile = get_or_create_profile(db, admin)
    return import_official_cards(db, profile.id, data, dry_run=dry_run)


def read_flashcard_summary(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FlashcardSummaryResponse:
    """Registered on the users router as GET /v1/me/flashcard-summary, the
    same way the cloze review summary is -- it is a property of the caller,
    not of any one lesson."""
    profile = get_or_create_profile(db, user)
    return get_flashcard_summary(db, profile.id)
