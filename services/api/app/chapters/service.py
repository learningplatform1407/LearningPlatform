import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.books.models import Book
from app.chapters.models import Chapter
from app.chapters.schemas import ChapterCreateRequest
from app.common.errors import ApiError
from app.sub_chapters.models import SubChapter


def _ensure_book_exists(db: Session, book_id: uuid.UUID) -> None:
    if db.get(Book, book_id) is None:
        raise ApiError(404, "not_found", "Book not found")


def list_chapters(db: Session, book_id: uuid.UUID) -> list[tuple[Chapter, int]]:
    _ensure_book_exists(db, book_id)

    sub_chapter_counts = (
        select(SubChapter.chapter_id, func.count(SubChapter.id).label("count"))
        .group_by(SubChapter.chapter_id)
        .subquery()
    )
    rows = db.execute(
        select(Chapter, func.coalesce(sub_chapter_counts.c.count, 0))
        .outerjoin(sub_chapter_counts, sub_chapter_counts.c.chapter_id == Chapter.id)
        .where(Chapter.book_id == book_id)
        .order_by(Chapter.order_index)
    ).all()
    return [(chapter, count) for chapter, count in rows]


def create_chapter(
    db: Session, book_id: uuid.UUID, created_by: uuid.UUID, data: ChapterCreateRequest
) -> Chapter:
    _ensure_book_exists(db, book_id)

    order_index = (
        db.scalar(select(func.count()).select_from(Chapter).where(Chapter.book_id == book_id)) or 0
    )
    chapter = Chapter(
        book_id=book_id, title=data.title, order_index=order_index, created_by=created_by
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter
