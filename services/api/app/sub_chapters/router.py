from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.sub_chapters.schemas import SubChapterCreateRequest, SubChapterResponse
from app.sub_chapters.service import create_sub_chapter, list_sub_chapters

router = APIRouter(prefix="/v1/chapters/{chapter_id}/sub-chapters", tags=["sub-chapters"])


@router.get("", response_model=list[SubChapterResponse])
def read_sub_chapters(
    chapter_id: UUID,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SubChapterResponse]:
    return [
        SubChapterResponse(
            id=sub_chapter.id,
            chapter_id=sub_chapter.chapter_id,
            title=sub_chapter.title,
            order_index=sub_chapter.order_index,
            lesson_count=lesson_count,
            created_at=sub_chapter.created_at,
        )
        for sub_chapter, lesson_count in list_sub_chapters(db, chapter_id)
    ]


@router.post("", response_model=SubChapterResponse)
def create_sub_chapter_route(
    chapter_id: UUID,
    data: SubChapterCreateRequest,
    admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SubChapterResponse:
    sub_chapter = create_sub_chapter(db, chapter_id, admin.id, data)
    return SubChapterResponse(
        id=sub_chapter.id,
        chapter_id=sub_chapter.chapter_id,
        title=sub_chapter.title,
        order_index=sub_chapter.order_index,
        lesson_count=0,
        created_at=sub_chapter.created_at,
    )
