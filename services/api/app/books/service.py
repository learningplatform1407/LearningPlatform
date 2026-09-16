import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.books.models import Book
from app.books.schemas import BookCreateRequest
from app.chapters.models import Chapter


def list_books(db: Session) -> list[tuple[Book, int]]:
    chapter_counts = (
        select(Chapter.book_id, func.count(Chapter.id).label("count"))
        .group_by(Chapter.book_id)
        .subquery()
    )
    rows = db.execute(
        select(Book, func.coalesce(chapter_counts.c.count, 0))
        .outerjoin(chapter_counts, chapter_counts.c.book_id == Book.id)
        .order_by(Book.order_index)
    ).all()
    return [(book, count) for book, count in rows]


def create_book(db: Session, created_by: uuid.UUID, data: BookCreateRequest) -> Book:
    order_index = db.scalar(select(func.count()).select_from(Book)) or 0
    book = Book(title=data.title, order_index=order_index, created_by=created_by)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book
