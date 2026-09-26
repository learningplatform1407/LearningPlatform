import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.books.service import list_books
from app.chapters.service import list_chapters
from app.cloze.generation import generate_cloze_spans
from app.cloze.models import ClozeCard, ClozeReviewState
from app.cloze.scheduler import ClozeRating, SchedulerState, compute_next_state
from app.cloze.schemas import (
    ReviewSummaryBook,
    ReviewSummaryChapter,
    ReviewSummaryLesson,
    ReviewSummaryResponse,
    ReviewSummarySubChapter,
)
from app.common.errors import ApiError
from app.documents.models import Document
from app.documents.service import list_documents
from app.sub_chapters.service import list_sub_chapters


def _to_utc_naive(value: datetime) -> datetime:
    """Postgres (production) round-trips DateTime(timezone=True) columns as
    tz-aware; SQLite (tests only) round-trips them as naive. Both represent
    the same UTC instant, so normalizing away the tzinfo before comparing
    keeps due-ness checks correct on either backend instead of crashing on
    a naive-vs-aware comparison."""
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


def ensure_cloze_cards(db: Session, document: Document) -> None:
    """Generates and persists this document's ClozeCards if it doesn't have
    any yet. Called both right after a fresh upload finishes extraction
    (app/documents/service.py) and lazily from the list/due functions below
    -- the latter means every already-existing ready lesson gets cards on
    its first read too, with no separate backfill migration needed."""
    if document.current_version is None or document.current_version.status != "ready":
        return
    existing = db.scalar(select(ClozeCard.id).where(ClozeCard.document_id == document.id).limit(1))
    if existing is not None:
        return
    blocks = (document.current_version.extracted_content or {}).get("blocks", [])
    for span in generate_cloze_spans(blocks):
        db.add(ClozeCard(document_id=document.id, **span))
    db.commit()


def list_cloze_cards(db: Session, document: Document) -> list[ClozeCard]:
    ensure_cloze_cards(db, document)
    return list(
        db.scalars(
            select(ClozeCard)
            .where(ClozeCard.document_id == document.id)
            .order_by(ClozeCard.block_index, ClozeCard.start_offset)
        )
    )


def list_due_cloze_cards(db: Session, document: Document, user_id: uuid.UUID) -> list[ClozeCard]:
    cards = list_cloze_cards(db, document)
    if not cards:
        return []
    states = {
        state.cloze_card_id: state
        for state in db.scalars(
            select(ClozeReviewState).where(
                ClozeReviewState.user_id == user_id,
                ClozeReviewState.cloze_card_id.in_([card.id for card in cards]),
            )
        )
    }
    now = _to_utc_naive(datetime.now(UTC))
    return [
        card
        for card in cards
        if (state := states.get(card.id)) is None or _to_utc_naive(state.due_at) <= now
    ]


def submit_cloze_review(
    db: Session, cloze_card_id: uuid.UUID, user_id: uuid.UUID, rating: ClozeRating
) -> ClozeReviewState:
    card = db.get(ClozeCard, cloze_card_id)
    if card is None:
        raise ApiError(404, "not_found", "Cloze card not found")

    state = db.scalar(
        select(ClozeReviewState).where(
            ClozeReviewState.user_id == user_id,
            ClozeReviewState.cloze_card_id == cloze_card_id,
        )
    )
    current = SchedulerState(
        ease_factor=state.ease_factor if state else 2.5,
        interval_days=state.interval_days if state else 0,
        repetitions=state.repetitions if state else 0,
    )
    result = compute_next_state(rating, current)

    if state is None:
        state = ClozeReviewState(user_id=user_id, cloze_card_id=cloze_card_id)
        db.add(state)

    state.ease_factor = result.ease_factor
    state.interval_days = result.interval_days
    state.repetitions = result.repetitions
    state.due_at = result.due_at
    state.last_reviewed_at = datetime.now(UTC)
    db.commit()
    db.refresh(state)
    return state


def _lesson_summary(db: Session, document: Document, user_id: uuid.UUID) -> ReviewSummaryLesson:
    ensure_cloze_cards(db, document)
    due_count = len(list_due_cloze_cards(db, document, user_id))
    return ReviewSummaryLesson(id=document.id, title=document.title, due_count=due_count)


def get_review_summary(db: Session, user_id: uuid.UUID) -> ReviewSummaryResponse:
    """Walks the same book -> chapter -> sub-chapter -> lesson hierarchy the
    Library page already reads (app/books/service.py, app/chapters/service.py,
    app/sub_chapters/service.py, app/documents/service.py), overlaying each
    lesson with its due-today cloze count and summing that count upward at
    every level. Every node is included, even at due_count 0 -- this powers
    a "see the whole course structure" dashboard, not a filtered due-only
    view. Walks the whole tree eagerly on every call rather than paginating
    or caching -- an accepted tradeoff for this app's scale."""
    books = []
    for book, _ in list_books(db):
        chapters = []
        for chapter, _ in list_chapters(db, book.id):
            sub_chapters = []
            for sub_chapter, _ in list_sub_chapters(db, chapter.id):
                lessons = [
                    _lesson_summary(db, doc, user_id)
                    for doc in list_documents(
                        db, sub_chapter_id=sub_chapter.id, filter_by_sub_chapter=True
                    )
                ]
                sub_chapters.append(
                    ReviewSummarySubChapter(
                        id=sub_chapter.id,
                        title=sub_chapter.title,
                        due_count=sum(lesson.due_count for lesson in lessons),
                        lessons=lessons,
                    )
                )
            chapters.append(
                ReviewSummaryChapter(
                    id=chapter.id,
                    title=chapter.title,
                    due_count=sum(sc.due_count for sc in sub_chapters),
                    sub_chapters=sub_chapters,
                )
            )
        books.append(
            ReviewSummaryBook(
                id=book.id,
                title=book.title,
                due_count=sum(chapter.due_count for chapter in chapters),
                chapters=chapters,
            )
        )

    uncategorized_lessons = [
        _lesson_summary(db, doc, user_id)
        for doc in list_documents(db, sub_chapter_id=None, filter_by_sub_chapter=True)
    ]

    return ReviewSummaryResponse(books=books, uncategorized_lessons=uncategorized_lessons)
