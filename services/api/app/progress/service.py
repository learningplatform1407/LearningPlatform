"""The single seam through which an answer becomes recorded progress.

Every path that grades an answer — a session answered with instant reveal, a
session graded at submit, and a question answered straight from the bank —
goes through `grade_and_record`. That is what keeps §5.5's rule ("only
answered questions create a row") in one place instead of three.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.hierarchy import load_content_tree
from app.documents.models import Document
from app.progress.constants import LESSON_COMPLETION_THRESHOLD
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


class _NodeStats(NamedTuple):
    totals: dict[uuid.UUID, int]
    answered: dict[uuid.UUID, int]
    outcomes: dict[uuid.UUID, dict[str, int]]
    points: dict[uuid.UUID, tuple[int, int]]


def _question_counts(db: Session, user_id: uuid.UUID) -> _NodeStats:
    """Published questions per lesson, how many this user has answered, the
    outcome breakdown of those answers, and the points earned vs. possible.

    Four grouped queries rather than one per lesson: the bank tree renders
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

    answered_join = published.join(
        QuestionProgress, QuestionProgress.question_id == Question.id
    ).where(QuestionProgress.user_id == user_id)
    answered = {
        document_id: count
        for document_id, count in db.execute(answered_join.group_by(Question.document_id)).all()
    }

    outcomes: dict[uuid.UUID, dict[str, int]] = {}
    outcome_rows = db.execute(
        select(Question.document_id, QuestionProgress.outcome, func.count(Question.id))
        .select_from(Question)
        .join(QuestionProgress, QuestionProgress.question_id == Question.id)
        .where(
            Question.status == QuestionStatus.PUBLISHED,
            Question.document_id.isnot(None),
            QuestionProgress.user_id == user_id,
        )
        .group_by(Question.document_id, QuestionProgress.outcome)
    ).all()
    for document_id, outcome, count in outcome_rows:
        outcomes.setdefault(document_id, {})[outcome] = count

    points: dict[uuid.UUID, tuple[int, int]] = {
        document_id: (awarded or 0, possible or 0)
        for document_id, awarded, possible in db.execute(
            select(
                Question.document_id,
                func.sum(QuestionProgress.points_awarded),
                func.sum(QuestionProgress.points_possible),
            )
            .select_from(Question)
            .join(QuestionProgress, QuestionProgress.question_id == Question.id)
            .where(
                Question.status == QuestionStatus.PUBLISHED,
                Question.document_id.isnot(None),
                QuestionProgress.user_id == user_id,
            )
            .group_by(Question.document_id)
        ).all()
    }

    return _NodeStats(totals, answered, outcomes, points)


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


class _UnassignedStats(NamedTuple):
    total: int
    answered: int
    outcomes: dict[str, int]
    points_awarded: int
    points_possible: int


def _unassigned_counts(db: Session, user_id: uuid.UUID) -> _UnassignedStats:
    """Published questions belonging to no lesson, and how many this user has
    answered, their outcome breakdown, and the points earned vs. possible.
    They hang under no tree node, so they need their own bucket."""
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

    base_where = (
        Question.status == QuestionStatus.PUBLISHED,
        Question.document_id.is_(None),
        QuestionProgress.user_id == user_id,
    )
    outcomes = {"correct": 0, "partial": 0, "incorrect": 0}
    for outcome, count in db.execute(
        select(QuestionProgress.outcome, func.count(Question.id))
        .select_from(Question)
        .join(QuestionProgress, QuestionProgress.question_id == Question.id)
        .where(*base_where)
        .group_by(QuestionProgress.outcome)
    ).all():
        outcomes[outcome] = count

    points_awarded, points_possible = db.execute(
        select(
            func.coalesce(func.sum(QuestionProgress.points_awarded), 0),
            func.coalesce(func.sum(QuestionProgress.points_possible), 0),
        )
        .select_from(Question)
        .join(QuestionProgress, QuestionProgress.question_id == Question.id)
        .where(*base_where)
    ).one()

    return _UnassignedStats(total, answered, outcomes, points_awarded, points_possible)


def get_bank_tree(db: Session, user_id: uuid.UUID) -> BankTreeResponse:
    """The content hierarchy annotated with question and progress counts.

    Composed from the same `list_*` services the library browser uses, so the
    bank shows exactly the structure students already navigate, carried one
    level deeper into the questions themselves.
    """
    totals, answered, outcomes, points = _question_counts(db, user_id)

    def lesson_node(document: Document) -> BankTreeLesson:
        doc_outcomes = outcomes.get(document.id, {})
        points_awarded, points_possible = points.get(document.id, (0, 0))
        question_count = totals.get(document.id, 0)
        answered_count = answered.get(document.id, 0)
        correct_count = doc_outcomes.get("correct", 0)
        # Excludes lessons with no published questions from both the
        # numerator and denominator — a lesson that can never be answered
        # should not count as "incomplete" against its chapter, the same
        # "not a stat" treatment BankStatsLine gives a zero-question node.
        eligible = 1 if question_count > 0 else 0
        completed = (
            1
            if eligible
            and answered_count > 0
            and correct_count / answered_count >= LESSON_COMPLETION_THRESHOLD
            else 0
        )
        return BankTreeLesson(
            id=document.id,
            title=document.title,
            question_count=question_count,
            answered_count=answered_count,
            correct_count=correct_count,
            partial_count=doc_outcomes.get("partial", 0),
            incorrect_count=doc_outcomes.get("incorrect", 0),
            points_awarded=points_awarded,
            points_possible=points_possible,
            eligible_lesson_count=eligible,
            completed_lesson_count=completed,
        )

    # One batched load of the structure instead of a query per parent, which
    # was 1 + B + B*C + B*C*S round-trips for a page both hubs open on mount.
    # The per-lesson counts above are already batched, so this was the only
    # N+1 left here.
    tree = load_content_tree(db)

    books: list[BankTreeBook] = []
    for book_node in tree.books:
        chapters: list[BankTreeChapter] = []
        for chapter_node in book_node.chapters:
            sub_chapters: list[BankTreeSubChapter] = []
            for sub_node in chapter_node.sub_chapters:
                sub_chapter = sub_node.sub_chapter
                lessons = [lesson_node(document) for document in sub_node.documents]
                sub_chapters.append(
                    BankTreeSubChapter(
                        id=sub_chapter.id,
                        title=sub_chapter.title,
                        question_count=sum(lesson.question_count for lesson in lessons),
                        answered_count=sum(lesson.answered_count for lesson in lessons),
                        correct_count=sum(lesson.correct_count for lesson in lessons),
                        partial_count=sum(lesson.partial_count for lesson in lessons),
                        incorrect_count=sum(lesson.incorrect_count for lesson in lessons),
                        points_awarded=sum(lesson.points_awarded for lesson in lessons),
                        points_possible=sum(lesson.points_possible for lesson in lessons),
                        eligible_lesson_count=sum(
                            lesson.eligible_lesson_count for lesson in lessons
                        ),
                        completed_lesson_count=sum(
                            lesson.completed_lesson_count for lesson in lessons
                        ),
                        lessons=lessons,
                    )
                )
            chapter = chapter_node.chapter
            chapters.append(
                BankTreeChapter(
                    id=chapter.id,
                    title=chapter.title,
                    question_count=sum(node.question_count for node in sub_chapters),
                    answered_count=sum(node.answered_count for node in sub_chapters),
                    correct_count=sum(node.correct_count for node in sub_chapters),
                    partial_count=sum(node.partial_count for node in sub_chapters),
                    incorrect_count=sum(node.incorrect_count for node in sub_chapters),
                    points_awarded=sum(node.points_awarded for node in sub_chapters),
                    points_possible=sum(node.points_possible for node in sub_chapters),
                    eligible_lesson_count=sum(node.eligible_lesson_count for node in sub_chapters),
                    completed_lesson_count=sum(
                        node.completed_lesson_count for node in sub_chapters
                    ),
                    sub_chapters=sub_chapters,
                )
            )
        book = book_node.book
        books.append(
            BankTreeBook(
                id=book.id,
                title=book.title,
                question_count=sum(node.question_count for node in chapters),
                answered_count=sum(node.answered_count for node in chapters),
                correct_count=sum(node.correct_count for node in chapters),
                partial_count=sum(node.partial_count for node in chapters),
                incorrect_count=sum(node.incorrect_count for node in chapters),
                points_awarded=sum(node.points_awarded for node in chapters),
                points_possible=sum(node.points_possible for node in chapters),
                eligible_lesson_count=sum(node.eligible_lesson_count for node in chapters),
                completed_lesson_count=sum(node.completed_lesson_count for node in chapters),
                chapters=chapters,
            )
        )

    uncategorized = [lesson_node(document) for document in tree.uncategorized_documents]
    unassigned = _unassigned_counts(db, user_id)
    return BankTreeResponse(
        books=books,
        uncategorized_lessons=uncategorized,
        unassigned_question_count=unassigned.total,
        unassigned_answered_count=unassigned.answered,
        unassigned_correct_count=unassigned.outcomes["correct"],
        unassigned_partial_count=unassigned.outcomes["partial"],
        unassigned_incorrect_count=unassigned.outcomes["incorrect"],
        unassigned_points_awarded=unassigned.points_awarded,
        unassigned_points_possible=unassigned.points_possible,
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
