from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.ink.schemas import LessonPageInkResponse, LessonPageInkUpdateRequest
from app.ink.service import get_ink, upsert_ink

router = APIRouter(prefix="/v1/documents/{document_id}/pages/{page_number}/ink", tags=["ink"])


@router.get("", response_model=LessonPageInkResponse)
def read_ink(
    document_id: UUID,
    page_number: int,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LessonPageInkResponse:
    strokes = get_ink(db, document_id, page_number, user.id)
    return LessonPageInkResponse(strokes=strokes)


@router.put("", response_model=LessonPageInkResponse)
def update_ink(
    document_id: UUID,
    page_number: int,
    data: LessonPageInkUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LessonPageInkResponse:
    strokes = upsert_ink(db, document_id, page_number, user, data.strokes)
    return LessonPageInkResponse(strokes=strokes)
