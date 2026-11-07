from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.ink.schemas import LessonPageInkResponse, LessonPageInkUpdateRequest, PageWordsResponse
from app.ink.service import get_ink, get_page_words, upsert_ink

router = APIRouter(prefix="/v1/documents/{document_id}/pages/{page_number}/ink", tags=["ink"])
words_router = APIRouter(
    prefix="/v1/documents/{document_id}/pages/{page_number}/words", tags=["ink"]
)

# 1-based, matching how both clients label pages. Annotated rather than a
# `= Path(...)` default so it stays a required parameter and can keep sitting
# ahead of `data` in update_ink's signature.
#
# Only the lower bound lives here: the upper bound needs the PDF's
# page_count, so it's enforced in app/ink/service.py::upsert_ink -- on write
# only, for the reason documented there.
PageNumber = Annotated[int, Path(ge=1)]


@router.get("", response_model=LessonPageInkResponse)
def read_ink(
    document_id: UUID,
    page_number: PageNumber,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LessonPageInkResponse:
    strokes, highlights = get_ink(db, document_id, page_number, user.id)
    return LessonPageInkResponse(strokes=strokes, highlights=highlights)


@router.put("", response_model=LessonPageInkResponse)
def update_ink(
    document_id: UUID,
    page_number: PageNumber,
    data: LessonPageInkUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LessonPageInkResponse:
    strokes, highlights = upsert_ink(
        db, document_id, page_number, user, data.strokes, data.highlights
    )
    return LessonPageInkResponse(strokes=strokes, highlights=highlights)


@words_router.get("", response_model=PageWordsResponse)
def read_page_words(
    document_id: UUID,
    page_number: PageNumber,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PageWordsResponse:
    return PageWordsResponse(words=get_page_words(db, document_id, page_number))
