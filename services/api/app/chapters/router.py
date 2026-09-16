from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.chapters.schemas import ChapterCreateRequest, ChapterResponse
from app.chapters.service import create_chapter, list_chapters
from app.db.session import get_db
from app.documents.dependencies import require_admin

router = APIRouter(prefix="/v1/books/{book_id}/chapters", tags=["chapters"])


@router.get("", response_model=list[ChapterResponse])
def read_chapters(
    book_id: UUID,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChapterResponse]:
    return [
        ChapterResponse(
            id=chapter.id,
            book_id=chapter.book_id,
            title=chapter.title,
            order_index=chapter.order_index,
            sub_chapter_count=sub_chapter_count,
            created_at=chapter.created_at,
        )
        for chapter, sub_chapter_count in list_chapters(db, book_id)
    ]


@router.post("", response_model=ChapterResponse)
def create_chapter_route(
    book_id: UUID,
    data: ChapterCreateRequest,
    admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChapterResponse:
    chapter = create_chapter(db, book_id, admin.id, data)
    return ChapterResponse(
        id=chapter.id,
        book_id=chapter.book_id,
        title=chapter.title,
        order_index=chapter.order_index,
        sub_chapter_count=0,
        created_at=chapter.created_at,
    )
