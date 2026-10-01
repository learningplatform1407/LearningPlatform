"""The single seam through which an answer becomes recorded progress.

Every path that grades an answer — a session answered with instant reveal, a
session graded at submit, and a question answered straight from the bank —
goes through `grade_and_record`. That is what keeps §5.5's rule ("only
answered questions create a row") in one place instead of three.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.books.service import list_books
from app.chapters.service import list_chapters
from app.documents.models import Document
from app.documents.service import list_documents
from app.progress.models import QuestionProgress
from app.progress.schemas import (
    BankTreeBook,
    BankTreeChapter,
    BankTreeLesson,
    BankTreeResponse,
    BankTreeSubChapter,
    QuestionProgressSummary,
)
from app.questions.constants import QuestionStatus
from app.questions.grading import grade_answer
from app.questions.models import Question
from app.sub_chapters.service import list_sub_chapters


def _record_attempt(
    db: Session,
    *,
    user_id: uuid.UUID,
    question_id: uuid.UUID,
    points_awarded: int,
    points_possible: int,
    outcome: str,
    now: datetime,
) -> None:
    existing = db.get(QuestionProgress, (user_id, question_id))
    if existing is not None:
        existing.outcome = outcome
        existing.points_awarded = points_awarded
        existing.points_possible = points_possible
        existing.attempt_count += 1
        existing.last_answered_at = now
        return

    # Two answers racing on a first attempt both see no row. Postgres blocks
    # the second INSERT until the first commits, then raises a unique
    # violation — catch it and fold into the row the other transaction just
    # created, the same pattern _resolve_tags uses for tag slugs.
    savepoint = db.begin_nested()
    try:
        db.add(
            QuestionProgress(
                user_id=user_id,
                question_id=question_id,
                outcome=outcome,
                points_awarded=points_awarded,
                points_possible=points_possible,
                attempt_count=1,
                last_answered_at=now,
            )
        )
        db.flush()
    except IntegrityError:
        savepoint.rollback()
        raced = db.get(QuestionProgress, (user_id, question_id))
        if raced is None:
            raise
        raced.outcome = outcome
        raced.points_awarded = points_awarded
        raced.points_possible = points_possible
        raced.attempt_count += 1
        raced.last_answered_at = now
    else:
        savepoint.commit()


def _question_counts(
    db: Session, user_id: uuid.UUID
) -> tuple[dict[uuid.UUID, int], dict[uuid.UUID, int]]:
    """Published questions per lesson, and how many this user has answered.

    Two grouped queries rather than one per lesson: the bank tree renders
    every node, so per-node counting would be a query per lesson on a screen
    loaded constantly.
    """
    published = select(Question.document_id, func.count(Question.id)).where(
        Question.status == QuestionStatus.PUBLISHED, Question.document_id.isnot(None)
    )
    totals = {
        document_id: count
        for document_id, count in db.execute(published.group_by(Question.document_id)).all()
    }
    answered = {
        document_id: count
        for document_id, count in db.execute(
            published.join(QuestionProgress, QuestionProgress.question_id == Question.id)
            .where(QuestionProgress.user_id == user_id)
            .group_by(Question.document_id)
        ).all()
    }
    return totals, answered


def get_progress_for_questions(
    db: Session, user_id: uuid.UUID, question_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, QuestionProgressSummary]:
    """This user's standing on each of `question_ids`, keyed by question id.

    Questions never attempted are simply absent from the mapping rather than
    present with a zero outcome — "not attempted" and "attempted and scored
    nothing" are different states, and a caller rendering a tick must not
    confuse them.

    One query for the whole page of questions, so marking browse results costs
    a single round trip no matter how many are shown. Guards the empty case
    because `IN ()` is invalid SQL.
    """
    if not question_ids:
        return {}
    rows = db.execute(
        select(QuestionProgress).where(
            QuestionProgress.user_id == user_id,
            QuestionProgress.question_id.in_(set(question_ids)),
        )
    ).scalars()
    return {
        row.question_id: QuestionProgressSummary(
            outcome=row.outcome,
            points_awarded=row.points_awarded,
            points_possible=row.points_possible,
            attempt_count=row.attempt_count,
            last_answered_at=row.last_answered_at,
        )
        for row in rows
    }


def _unassigned_counts(db: Session, user_id: uuid.UUID) -> tuple[int, int]:
    """Published questions belonging to no lesson, and how many this user has
    answered. They hang under no tree node, so they need their own bucket."""
    unassigned = select(func.count(Question.id)).where(
        Question.status == QuestionStatus.PUBLISHED, Question.document_id.is_(None)
    )
    total = db.scalar(unassigned) or 0
    answered = (
        db.scalar(
            unassigned.join(QuestionProgress, QuestionProgress.question_id == Question.id).where(
                QuestionProgress.user_id == user_id
            )
        )
        or 0
    )
    return total, answered


def get_bank_tree(db: Session, user_id: uuid.UUID) -> BankTreeResponse:
    """The content hierarchy annotated with question and progress counts.

    Composed from the same `list_*` services the library browser uses, so the
    bank shows exactly the structure students already navigate, carried one
    level deeper into the questions themselves.
    """
    totals, answered = _question_counts(db, user_id)

    def lesson_node(document: Document) -> BankTreeLesson:
        return BankTreeLesson(
            id=document.id,
            title=document.title,
            question_count=totals.get(document.id, 0),
            answered_count=answered.get(document.id, 0),
        )

    books: list[BankTreeBook] = []
    for book, _ in list_books(db):
        chapters: list[BankTreeChapter] = []
        for chapter, _ in list_chapters(db, book.id):
            sub_chapters: list[BankTreeSubChapter] = []
            for sub_chapter, _ in list_sub_chapters(db, chapter.id):
                lessons = [
                    lesson_node(document)
                    for document in list_documents(
                        db, sub_chapter_id=sub_chapter.id, filter_by_sub_chapter=True
                    )
                ]
                sub_chapters.append(
                    BankTreeSubChapter(
                        id=sub_chapter.id,
                        title=sub_chapter.title,
                        question_count=sum(lesson.question_count for lesson in lessons),
                        answered_count=sum(lesson.answered_count for lesson in lessons),
                        lessons=lessons,
                    )
                )
            chapters.append(
                BankTreeChapter(
                    id=chapter.id,
                    title=chapter.title,
                    question_count=sum(node.question_count for node in sub_chapters),
                    answered_count=sum(node.answered_count for node in sub_chapters),
                    sub_chapters=sub_chapters,
                )
            )
        books.append(
            BankTreeBook(
                id=book.id,
                title=book.title,
                question_count=sum(node.question_count for node in chapters),
                answered_count=sum(node.answered_count for node in chapters),
                chapters=chapters,
            )
        )

    uncategorized = [
        lesson_node(document)
        for document in list_documents(db, sub_chapter_id=None, filter_by_sub_chapter=True)
    ]
    unassigned_total, unassigned_answered = _unassigned_counts(db, user_id)
    return BankTreeResponse(
        books=books,
        uncategorized_lessons=uncategorized,
        unassigned_question_count=unassigned_total,
        unassigned_answered_count=unassigned_answered,
    )


def grade_and_record(
    db: Session,
    *,
    user_id: uuid.UUID,
    question: Question,
    scoring_scheme: str,
    points_possible: int,
    selected_option_ids: list[str],
    now: datetime,
) -> tuple[int, str]:
    """Grade an answer and record it, returning (points, outcome).

    **Unanswered questions write no progress.** They still score 0 within a
    session, but "40/200 completed" has to mean 40 genuinely attempted, not
    40 displayed — a student who times out with 30 questions unseen should
    not find 30 topic items marked incorrect (§5.5). That single `if` below
    is the whole rule.

    Never commits: the caller's transaction owns that, because a session
    answer writes the session row and the progress row together.
    """
    points, outcome = grade_answer(
        scoring_scheme,
        selected_option_ids,
        question.correct_option_ids,
        [option["id"] for option in question.options],
    )
    if selected_option_ids:
        _record_attempt(
            db,
            user_id=user_id,
            question_id=question.id,
            points_awarded=points,
            points_possible=points_possible,
            outcome=outcome,
            now=now,
        )
    return points, outcome
