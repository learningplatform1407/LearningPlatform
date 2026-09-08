import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.chapters.models import Chapter
from app.common.errors import ApiError
from app.documents.models import Document
from app.sub_chapters.models import SubChapter
from app.sub_chapters.schemas import SubChapterCreateRequest


def _ensure_chapter_exists(db: Session, chapter_id: uuid.UUID) -> None:
    if db.get(Chapter, chapter_id) is None:
        raise ApiError(404, "not_found", "Chapter not found")


def list_sub_chapters(db: Session, chapter_id: uuid.UUID) -> list[tuple[SubChapter, int]]:
    _ensure_chapter_exists(db, chapter_id)

    lesson_counts = (
        select(Document.sub_chapter_id, func.count(Document.id).label("count"))
        .group_by(Document.sub_chapter_id)
        .subquery()
    )
    rows = db.execute(
        select(SubChapter, func.coalesce(lesson_counts.c.count, 0))
        .outerjoin(lesson_counts, lesson_counts.c.sub_chapter_id == SubChapter.id)
        .where(SubChapter.chapter_id == chapter_id)
        .order_by(SubChapter.order_index)
    ).all()
    return [(sub_chapter, count) for sub_chapter, count in rows]


def create_sub_chapter(
    db: Session, chapter_id: uuid.UUID, created_by: uuid.UUID, data: SubChapterCreateRequest
) -> SubChapter:
    _ensure_chapter_exists(db, chapter_id)

    order_index = (
        db.scalar(
            select(func.count()).select_from(SubChapter).where(SubChapter.chapter_id == chapter_id)
        )
        or 0
    )
    sub_chapter = SubChapter(
        chapter_id=chapter_id, title=data.title, order_index=order_index, created_by=created_by
    )
    db.add(sub_chapter)
    db.commit()
    db.refresh(sub_chapter)
    return sub_chapter
