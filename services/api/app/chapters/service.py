import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.chapters.models import Chapter
from app.chapters.schemas import ChapterCreateRequest
from app.sub_chapters.models import SubChapter


def list_chapters(db: Session) -> list[tuple[Chapter, int]]:
    sub_chapter_counts = (
        select(SubChapter.chapter_id, func.count(SubChapter.id).label("count"))
        .group_by(SubChapter.chapter_id)
        .subquery()
    )
    rows = db.execute(
        select(Chapter, func.coalesce(sub_chapter_counts.c.count, 0))
        .outerjoin(sub_chapter_counts, sub_chapter_counts.c.chapter_id == Chapter.id)
        .order_by(Chapter.order_index)
    ).all()
    return [(chapter, count) for chapter, count in rows]


def create_chapter(db: Session, created_by: uuid.UUID, data: ChapterCreateRequest) -> Chapter:
    order_index = db.scalar(select(func.count()).select_from(Chapter)) or 0
    chapter = Chapter(title=data.title, order_index=order_index, created_by=created_by)
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter
