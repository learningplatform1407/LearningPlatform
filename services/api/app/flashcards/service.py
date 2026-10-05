import random
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session

from app.books.service import list_books
from app.chapters.service import list_chapters
from app.common.errors import ApiError
from app.documents.models import Document
from app.documents.service import list_documents
from app.flashcards.constants import (
    MAX_IMPORT_FLASHCARDS,
    FlashcardScope,
    FlashcardStatus,
    ScopeFilter,
)
from app.flashcards.models import Flashcard, FlashcardReviewState
from app.flashcards.schemas import (
    FlashcardImportRequest,
    FlashcardImportResult,
    FlashcardSummaryBook,
    FlashcardSummaryChapter,
    FlashcardSummaryLesson,
    FlashcardSummaryResponse,
    FlashcardSummarySubChapter,
    ImportErrorItem,
)
from app.srs.scheduler import ReviewRating, SchedulerState, compute_next_state
from app.sub_chapters.service import list_sub_chapters


def _to_utc_naive(value: datetime) -> datetime:
    """Postgres (production) round-trips DateTime(timezone=True) columns as
    tz-aware; SQLite (tests only) round-trips them as naive. Both represent
    the same UTC instant, so normalizing away the tzinfo before comparing
    keeps due-ness checks correct on either backend instead of crashing on
    a naive-vs-aware comparison. Same helper as app/cloze/service.py."""
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


def apply_visible_filter[T: tuple[Any, ...]](
    query: Select[T],
    *,
    user_id: uuid.UUID,
    document_ids: list[uuid.UUID] | None = None,
    scope: ScopeFilter = ScopeFilter.ALL,
) -> Select[T]:
    """The single seam deciding which cards a learner may see, playing the
    same role `apply_published_filter` plays for questions.

    Every read path goes through it -- the lesson list, the deck draw, the
    single-card lookup and the summary counts -- so they cannot disagree
    about visibility. A learner sees published official cards plus their own
    published personal cards, and never anybody else's personal card.
    """
    query = query.where(Flashcard.status == FlashcardStatus.PUBLISHED)
    if document_ids is not None:
        query = query.where(Flashcard.document_id.in_(document_ids))

    if scope == ScopeFilter.OFFICIAL:
        return query.where(Flashcard.scope == FlashcardScope.OFFICIAL)
    if scope == ScopeFilter.PERSONAL:
        return query.where(
            Flashcard.scope == FlashcardScope.PERSONAL,
            Flashcard.created_by == user_id,
        )
    return query.where(
        or_(
            Flashcard.scope == FlashcardScope.OFFICIAL,
            and_(
                Flashcard.scope == FlashcardScope.PERSONAL,
                Flashcard.created_by == user_id,
            ),
        )
    )


def list_lesson_cards(
    db: Session,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    scope: ScopeFilter = ScopeFilter.ALL,
) -> list[Flashcard]:
    """The management view: author order, not study order."""
    query = apply_visible_filter(
        select(Flashcard), user_id=user_id, document_ids=[document_id], scope=scope
    )
    return list(db.scalars(query.order_by(Flashcard.order_index, Flashcard.created_at)))


def get_visible_card(db: Session, user_id: uuid.UUID, flashcard_id: uuid.UUID) -> Flashcard:
    """404, never 403, when the card exists but isn't this learner's to see --
    matching `_get_owned_session` in app/quizzes/service.py. Probing for other
    people's card ids must not tell you whether they exist."""
    card = db.scalar(
        apply_visible_filter(select(Flashcard), user_id=user_id).where(Flashcard.id == flashcard_id)
    )
    if card is None:
        raise ApiError(404, "not_found", "Flashcard not found")
    return card


def draw_lesson_deck(
    db: Session,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    scope: ScopeFilter = ScopeFilter.ALL,
    limit: int = 20,
) -> list[tuple[Flashcard, FlashcardReviewState | None]]:
    """Due cards first (oldest deadline first), then new cards in random
    order, truncated to `limit`.

    Cards already graded and not yet due are excluded -- that is the whole
    point of the scheduler. `order_index` is deliberately ignored here: the
    lecture's own ordering is for the management list, while studying should
    be driven by the schedule and, past that, by chance.

    The partition happens in Python rather than as `ORDER BY random()` in SQL
    because due-ness needs `_to_utc_naive` to stay correct on SQLite, which
    means materialising the lesson's visible cards anyway. One lesson's cards
    are bounded by what an admin imports for one lecture, and
    `list_due_cloze_cards` already reads a lesson's cards the same way.
    """
    rows = db.execute(
        apply_visible_filter(
            select(Flashcard, FlashcardReviewState).outerjoin(
                FlashcardReviewState,
                and_(
                    FlashcardReviewState.flashcard_id == Flashcard.id,
                    FlashcardReviewState.user_id == user_id,
                ),
            ),
            user_id=user_id,
            document_ids=[document_id],
            scope=scope,
        )
    ).all()

    now = _to_utc_naive(datetime.now(UTC))
    due: list[tuple[Flashcard, FlashcardReviewState | None]] = []
    fresh: list[tuple[Flashcard, FlashcardReviewState | None]] = []
    for card, state in rows:
        if state is None or state.last_reviewed_at is None:
            fresh.append((card, state))
        elif _to_utc_naive(state.due_at) <= now:
            due.append((card, state))

    due.sort(key=lambda row: _to_utc_naive(row[1].due_at) if row[1] else now)
    random.shuffle(fresh)
    return (due + fresh)[:limit]


def create_personal_card(
    db: Session,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    front_text: str,
    back_text: str,
) -> Flashcard:
    """`scope` and `created_by` are set here, never taken from the request --
    see FlashcardScope. An admin calling this gets a personal card, because
    what decides provenance is the endpoint, not the caller's role."""
    if db.get(Document, document_id) is None:
        raise ApiError(404, "not_found", "Document not found")

    card = Flashcard(
        document_id=document_id,
        scope=FlashcardScope.PERSONAL,
        status=FlashcardStatus.PUBLISHED,
        front_text=front_text,
        back_text=back_text,
        created_by=user_id,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def update_personal_card(
    db: Session,
    user_id: uuid.UUID,
    flashcard_id: uuid.UUID,
    front_text: str | None,
    back_text: str | None,
) -> Flashcard:
    card = get_visible_card(db, user_id, flashcard_id)
    if card.scope != FlashcardScope.PERSONAL or card.created_by != user_id:
        # Visible but not yours: an official card, or (not reachable today)
        # somebody else's. 404 for the same reason as get_visible_card.
        raise ApiError(404, "not_found", "Flashcard not found")

    if front_text is not None:
        card.front_text = front_text
    if back_text is not None:
        card.back_text = back_text
    db.commit()
    db.refresh(card)
    return card


def delete_card(db: Session, user_id: uuid.UUID, flashcard_id: uuid.UUID, is_admin: bool) -> None:
    """Asymmetric on purpose. A personal card is hard-deleted -- it is the
    learner's own data and there is nothing to preserve. An official card is
    archived instead, matching DELETE /v1/questions/{id}, because other
    people's review history points at it."""
    card = get_visible_card(db, user_id, flashcard_id)

    if card.scope == FlashcardScope.PERSONAL:
        if card.created_by != user_id:
            raise ApiError(404, "not_found", "Flashcard not found")
        db.delete(card)
        db.commit()
        return

    if not is_admin:
        raise ApiError(403, "forbidden", "Only an admin can retire an official flashcard")
    card.status = FlashcardStatus.ARCHIVED
    db.commit()


def submit_flashcard_review(
    db: Session, user_id: uuid.UUID, flashcard_id: uuid.UUID, rating: ReviewRating
) -> FlashcardReviewState:
    """Writes `flashcard_review_states` and nothing else. In particular it
    never touches `question_progress`: a self-rating is not an answer, and
    counting it would corrupt the question bank's success/failure stats."""
    get_visible_card(db, user_id, flashcard_id)

    state = db.scalar(
        select(FlashcardReviewState).where(
            FlashcardReviewState.user_id == user_id,
            FlashcardReviewState.flashcard_id == flashcard_id,
        )
    )
    current = SchedulerState(
        ease_factor=state.ease_factor if state else 2.5,
        interval_days=state.interval_days if state else 0,
        repetitions=state.repetitions if state else 0,
    )
    result = compute_next_state(rating, current)

    if state is None:
        state = FlashcardReviewState(user_id=user_id, flashcard_id=flashcard_id)
        db.add(state)

    state.ease_factor = result.ease_factor
    state.interval_days = result.interval_days
    state.repetitions = result.repetitions
    state.due_at = result.due_at
    state.last_reviewed_at = datetime.now(UTC)
    db.commit()
    db.refresh(state)
    return state


def import_official_cards(
    db: Session, admin_id: uuid.UUID, data: FlashcardImportRequest, dry_run: bool
) -> FlashcardImportResult:
    """Idempotent upsert keyed on `external_id`, so re-importing a payload
    updates rather than duplicating.

    `dry_run` runs the real insert/update path inside a SAVEPOINT and rolls
    it back, so a preview can never drift from what a commit does -- the same
    guarantee the question importer gives.
    """
    if len(data.flashcards) > MAX_IMPORT_FLASHCARDS:
        raise ApiError(
            400,
            "too_many_flashcards",
            f"At most {MAX_IMPORT_FLASHCARDS} flashcards per request",
        )

    errors: list[ImportErrorItem] = []
    seen: dict[str, int] = {}
    for index, item in enumerate(data.flashcards):
        if item.external_id in seen:
            errors.append(
                ImportErrorItem(
                    index=index,
                    field="external_id",
                    message=f"Duplicate of entry {seen[item.external_id]} in this payload",
                )
            )
            continue
        seen[item.external_id] = index
        if db.get(Document, item.document_id) is None:
            errors.append(
                ImportErrorItem(index=index, field="document_id", message="Unknown lesson")
            )

    if errors:
        return FlashcardImportResult(
            created=0, updated=0, skipped=len(data.flashcards), errors=errors
        )

    nested = db.begin_nested()
    created = 0
    updated = 0
    for item in data.flashcards:
        existing = db.scalar(select(Flashcard).where(Flashcard.external_id == item.external_id))
        if existing is None:
            db.add(
                Flashcard(
                    document_id=item.document_id,
                    external_id=item.external_id,
                    scope=FlashcardScope.OFFICIAL,
                    status=item.status,
                    front_text=item.front_text,
                    back_text=item.back_text,
                    order_index=item.order_index,
                    created_by=admin_id,
                )
            )
            created += 1
            continue

        existing.document_id = item.document_id
        existing.front_text = item.front_text
        existing.back_text = item.back_text
        existing.order_index = item.order_index
        existing.status = item.status
        # Not reassigned to admin_id: created_by is the audit trail of who
        # first added the card, not who last touched it.
        updated += 1

    db.flush()
    if dry_run:
        nested.rollback()
    else:
        nested.commit()
        db.commit()

    return FlashcardImportResult(created=created, updated=updated, skipped=0, errors=[])


def _deck_counts(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, int]]:
    """document_id -> (due_count, new_count) for every card this learner can
    see, in one query.

    Deliberately not one query per lesson the way `get_review_summary` does
    it: the hub walks the entire course tree, so per-lesson queries would be
    hundreds of round-trips for a dashboard.
    """
    rows = db.execute(
        apply_visible_filter(
            select(Flashcard.document_id, FlashcardReviewState).outerjoin(
                FlashcardReviewState,
                and_(
                    FlashcardReviewState.flashcard_id == Flashcard.id,
                    FlashcardReviewState.user_id == user_id,
                ),
            ),
            user_id=user_id,
        )
    ).all()

    now = _to_utc_naive(datetime.now(UTC))
    counts: dict[uuid.UUID, tuple[int, int]] = defaultdict(lambda: (0, 0))
    for document_id, state in rows:
        due, fresh = counts[document_id]
        if state is None or state.last_reviewed_at is None:
            counts[document_id] = (due, fresh + 1)
        elif _to_utc_naive(state.due_at) <= now:
            counts[document_id] = (due + 1, fresh)
    return counts


def _lesson_summary(
    document: Document, counts: dict[uuid.UUID, tuple[int, int]]
) -> FlashcardSummaryLesson:
    due, fresh = counts.get(document.id, (0, 0))
    return FlashcardSummaryLesson(
        id=document.id, title=document.title, due_count=due, new_count=fresh
    )


def get_flashcard_summary(db: Session, user_id: uuid.UUID) -> FlashcardSummaryResponse:
    """Walks the same book -> chapter -> sub-chapter -> lesson hierarchy the
    Library and Review dashboards read, overlaying each lesson with its due
    and new counts and summing both upward.

    Every node is included, even at zero -- this is a "see the whole course"
    dashboard, not a filtered due-only view. Due and new are reported
    separately so the hub can say "4 due · 12 new" instead of implying every
    card nobody has opened yet is overdue.
    """
    counts = _deck_counts(db, user_id)

    books = []
    for book, _ in list_books(db):
        chapters = []
        for chapter, _ in list_chapters(db, book.id):
            sub_chapters = []
            for sub_chapter, _ in list_sub_chapters(db, chapter.id):
                lessons = [
                    _lesson_summary(doc, counts)
                    for doc in list_documents(
                        db, sub_chapter_id=sub_chapter.id, filter_by_sub_chapter=True
                    )
                ]
                sub_chapters.append(
                    FlashcardSummarySubChapter(
                        id=sub_chapter.id,
                        title=sub_chapter.title,
                        due_count=sum(lesson.due_count for lesson in lessons),
                        new_count=sum(lesson.new_count for lesson in lessons),
                        lessons=lessons,
                    )
                )
            chapters.append(
                FlashcardSummaryChapter(
                    id=chapter.id,
                    title=chapter.title,
                    due_count=sum(sc.due_count for sc in sub_chapters),
                    new_count=sum(sc.new_count for sc in sub_chapters),
                    sub_chapters=sub_chapters,
                )
            )
        books.append(
            FlashcardSummaryBook(
                id=book.id,
                title=book.title,
                due_count=sum(chapter.due_count for chapter in chapters),
                new_count=sum(chapter.new_count for chapter in chapters),
                chapters=chapters,
            )
        )

    uncategorized_lessons = [
        _lesson_summary(doc, counts)
        for doc in list_documents(db, sub_chapter_id=None, filter_by_sub_chapter=True)
    ]

    return FlashcardSummaryResponse(books=books, uncategorized_lessons=uncategorized_lessons)
