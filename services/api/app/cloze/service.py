import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cloze.generation import generate_cloze_spans
from app.cloze.models import ClozeCard, ClozeReviewState
from app.cloze.schemas import (
    ReviewSummaryBook,
    ReviewSummaryChapter,
    ReviewSummaryLesson,
    ReviewSummaryResponse,
    ReviewSummarySubChapter,
)
from app.common.errors import ApiError
from app.common.hierarchy import load_content_tree
from app.documents.models import Document
from app.srs.scheduler import (
    DEFAULT_EASE_FACTOR,
    ReviewRating,
    SchedulerState,
    compute_next_state,
    to_utc_naive,
)


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
    now = to_utc_naive(datetime.now(UTC))
    return [
        card
        for card in cards
        if (state := states.get(card.id)) is None or to_utc_naive(state.due_at) <= now
    ]


def submit_cloze_review(
    db: Session, cloze_card_id: uuid.UUID, user_id: uuid.UUID, rating: ReviewRating
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
        ease_factor=state.ease_factor if state else DEFAULT_EASE_FACTOR,
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
    """Overlays each lesson's due cloze count on the course tree, summing
    upward. Every node is included, even at due_count 0 -- this powers a
    "see the whole course structure" dashboard, not a filtered due-only view.

    The structure comes from `load_content_tree` in four queries rather than
    the nested per-parent walk this used to do. Note the per-lesson cost
    below is unchanged and still dominates: `_lesson_summary` generates and
    reads that lesson's cloze cards, which cannot be batched while generation
    is lazy per document. Flashcards avoids it by batching its counts into
    one query; doing the same here is a separate change.
    """
    tree = load_content_tree(db)

    books = []
    for book_node in tree.books:
        chapters = []
        for chapter_node in book_node.chapters:
            sub_chapters = []
            for sub_node in chapter_node.sub_chapters:
                lessons = [_lesson_summary(db, doc, user_id) for doc in sub_node.documents]
                sub_chapters.append(
                    ReviewSummarySubChapter(
                        id=sub_node.sub_chapter.id,
                        title=sub_node.sub_chapter.title,
                        due_count=sum(lesson.due_count for lesson in lessons),
                        lessons=lessons,
                    )
                )
            chapters.append(
                ReviewSummaryChapter(
                    id=chapter_node.chapter.id,
                    title=chapter_node.chapter.title,
                    due_count=sum(sc.due_count for sc in sub_chapters),
                    sub_chapters=sub_chapters,
                )
            )
        books.append(
            ReviewSummaryBook(
                id=book_node.book.id,
                title=book_node.book.title,
                due_count=sum(chapter.due_count for chapter in chapters),
                chapters=chapters,
            )
        )

    uncategorized_lessons = [
        _lesson_summary(db, doc, user_id) for doc in tree.uncategorized_documents
    ]

    return ReviewSummaryResponse(books=books, uncategorized_lessons=uncategorized_lessons)
