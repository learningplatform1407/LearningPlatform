from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.books.schemas import BookCreateRequest, BookResponse
from app.books.service import create_book, list_books
from app.db.session import get_db
from app.documents.dependencies import require_admin

router = APIRouter(prefix="/v1/books", tags=["books"])


@router.get("", response_model=list[BookResponse])
def read_books(
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BookResponse]:
    return [
        BookResponse(
            id=book.id,
            title=book.title,
            order_index=book.order_index,
            chapter_count=chapter_count,
            created_at=book.created_at,
        )
        for book, chapter_count in list_books(db)
    ]


@router.post("", response_model=BookResponse)
def create_book_route(
    data: BookCreateRequest,
    admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> BookResponse:
    book = create_book(db, admin.id, data)
    return BookResponse(
        id=book.id,
        title=book.title,
        order_index=book.order_index,
        chapter_count=0,
        created_at=book.created_at,
    )
