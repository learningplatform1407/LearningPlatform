import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cloze.models import ClozeCard, ClozeReviewState
from app.cloze.schemas import (
    ClozeCardCreateRequest,
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


def _ready_blocks(document: Document) -> list[dict[str, Any]]:
    """This lesson's extracted blocks, or [] until extraction has succeeded.

    A cloze card is a pair of offsets into one of these blocks, so nothing
    can be marked before they exist and a card can only be validated
    against them.
    """
    if document.current_version is None or document.current_version.status != "ready":
        return []
    blocks = (document.current_version.extracted_content or {}).get("blocks", [])
    return blocks if isinstance(blocks, list) else []


def create_cloze_card(db: Session, document: Document, data: ClozeCardCreateRequest) -> ClozeCard:
    """Marks one passage of one paragraph as a review word.

    `answer_text` is sliced from the lesson here rather than taken from the
    request: the offsets are the only thing a client gets to choose, so a
    card can never claim an answer the lesson does not actually say at that
    position. Which is also what makes the Review tab's gap safe -- it is
    rendered from the lesson text at those offsets, never from the stored
    answer.
    """
    blocks = _ready_blocks(document)
    block = blocks[data.block_index] if data.block_index < len(blocks) else None
    if block is None:
        raise ApiError(422, "invalid_block", "No such block in this lesson")
    if block.get("type") != "paragraph":
        raise ApiError(422, "invalid_block", "Review words can only be marked in paragraphs")
    text = block.get("text") or ""
    if data.end_offset > len(text):
        raise ApiError(422, "invalid_offsets", "Offsets fall outside the paragraph")
    answer_text = text[data.start_offset : data.end_offset]
    if not answer_text.strip():
        raise ApiError(422, "invalid_offsets", "A review word cannot be blank")

    # Overlapping cards would render as nested gaps -- spliceClozeSpans on
    # the clients assumes spans do not intersect -- so the overlap is
    # refused rather than silently collapsed.
    clash = db.scalar(
        select(ClozeCard.id).where(
            ClozeCard.document_id == document.id,
            ClozeCard.block_index == data.block_index,
            ClozeCard.start_offset < data.end_offset,
            ClozeCard.end_offset > data.start_offset,
        )
    )
    if clash is not None:
        raise ApiError(409, "overlapping_card", "That passage already holds a review word")

    card = ClozeCard(
        document_id=document.id,
        block_index=data.block_index,
        start_offset=data.start_offset,
        end_offset=data.end_offset,
        answer_text=answer_text,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def delete_cloze_card(db: Session, document: Document, cloze_card_id: uuid.UUID) -> None:
    """Unmarks a review word. Every learner's progress against it goes with
    it (ClozeReviewState cascades on the FK) -- the word is no longer part
    of the lesson, so there is nothing left for that progress to be about.
    """
    card = db.get(ClozeCard, cloze_card_id)
    if card is None or card.document_id != document.id:
        raise ApiError(404, "not_found", "Cloze card not found")
    db.delete(card)
    db.commit()


def list_cloze_cards(db: Session, document: Document) -> list[ClozeCard]:
    return list(
        db.scalars(
            select(ClozeCard)
            .where(ClozeCard.document_id == document.id)
            .order_by(ClozeCard.block_index, ClozeCard.start_offset)
        )
    )


def list_due_cloze_cards_with_state(
    db: Session, document: Document, user_id: uuid.UUID
) -> list[tuple[ClozeCard, ClozeReviewState | None]]:
    """Due cards with this user's review state (None for a card never graded),
    which the due endpoint turns into interval previews."""
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
        (card, state)
        for card in cards
        if (state := states.get(card.id)) is None or to_utc_naive(state.due_at) <= now
    ]


def list_due_cloze_cards(db: Session, document: Document, user_id: uuid.UUID) -> list[ClozeCard]:
    return [card for card, _ in list_due_cloze_cards_with_state(db, document, user_id)]


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
    due_count = len(list_due_cloze_cards(db, document, user_id))
    return ReviewSummaryLesson(id=document.id, title=document.title, due_count=due_count)


def get_review_summary(db: Session, user_id: uuid.UUID) -> ReviewSummaryResponse:
    """Overlays each lesson's due cloze count on the course tree, summing
    upward. Every node is included, even at due_count 0 -- this powers a
    "see the whole course structure" dashboard, not a filtered due-only view.

    The structure comes from `load_content_tree` in four queries rather than
    the nested per-parent walk this used to do. Note the per-lesson cost
    below is unchanged and still dominates: `_lesson_summary` reads that
    lesson's cards and its review states, two queries per lesson.
    Flashcards avoids it by batching its counts into one query; doing the
    same here is a separate change.
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
