import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.errors import ApiError
from app.daily.constants import MAX_CALENDAR_SPAN_DAYS
from app.daily.models import DailyQuestion, DailyQuestionAttempt
from app.questions.constants import QuestionStatus
from app.questions.grading import grade_answer, validate_selection
from app.questions.models import Question
from app.questions.scoring import get_scheme
from app.questions.service import apply_published_filter


def _draw(db: Session, *, exclude: uuid.UUID | None = None) -> Question | None:
    """A random published question, preferring one no day has used yet.

    Reuses `apply_published_filter` rather than writing a second definition of
    "a question a student may be shown" -- that function exists to be shared,
    and a divergence between the two would mean a draft could become a
    question of the day. `document_ids=None, tag_ids=[]` is the unscoped call
    the bank-answer route makes.

    Repeats are allowed once the pool is exhausted. A bank of thirty questions
    must not stop producing a daily question on day thirty-one, and a silent
    "no question today" would read as a bug.
    """
    base = apply_published_filter(select(Question), document_ids=None, tag_ids=[])
    if exclude is not None:
        base = base.where(Question.id != exclude)

    # Annotated because apply_published_filter returns Select[Any], so the
    # scalar comes back untyped -- pinning it here keeps the boundary honest
    # rather than leaking Any to every caller.
    unused = ~select(1).where(DailyQuestion.question_id == Question.id).exists()
    question: Question | None = db.scalar(base.where(unused).order_by(func.random()).limit(1))
    if question is None:
        question = db.scalar(base.order_by(func.random()).limit(1))
    return question


def _insert_day(db: Session, *, for_date: date, question_id: uuid.UUID) -> DailyQuestion:
    """Insert a day, folding into whoever won if two readers raced.

    Every reader of an unmaterialised day tries to create it, so every reader
    races. The savepoint keeps a losing INSERT from poisoning the outer
    transaction -- the same idiom `_record_attempt` uses in
    app/progress/service.py.

    Deliberately no `with_for_update()`: that locks an existing row, and the
    whole premise here is that there isn't one yet. Postgres serialises the
    two inserts on the primary key instead. The loser's wasted draw is fine --
    nobody sees a different question, because the winner's row is what gets
    returned.
    """
    savepoint = db.begin_nested()
    try:
        row = DailyQuestion(for_date=for_date, question_id=question_id)
        db.add(row)
        db.flush()
    except IntegrityError:
        savepoint.rollback()
        raced = db.get(DailyQuestion, for_date)
        if raced is None:
            # Not a race after all -- re-raise rather than mistake some other
            # integrity failure for one.
            raise
        return raced
    savepoint.commit()
    return row


def ensure_today(db: Session, *, today: date) -> DailyQuestion | None:
    """Today's row, materialising it on first read.

    There is no scheduler in this repo, and this needs none: the first person
    to open the Learn page on a given day causes the draw, and everyone after
    reads the row they created. Returns None when the bank holds no published
    question, writing nothing, so the next day self-heals.
    """
    existing = db.get(DailyQuestion, today)
    if existing is not None:
        return existing

    question = _draw(db)
    if question is None:
        return None
    return _insert_day(db, for_date=today, question_id=question.id)


def get_day(db: Session, for_date: date, *, today: date) -> DailyQuestion | None:
    """One day's row, without ever creating one for the past.

    A past date that was never materialised stays empty. Drawing for it now
    would invent a question that was never that day's -- and would let someone
    open old dates to farm fresh, answerable questions.

    A future date 404s rather than 403s: an admin may have pre-booked it, and
    confirming a row exists would leak that tomorrow's question is set.
    """
    if for_date > today:
        raise ApiError(404, "not_found", "No question for that day")
    if for_date == today:
        return ensure_today(db, today=today)
    return db.get(DailyQuestion, for_date)


def get_attempt(db: Session, *, user_id: uuid.UUID, for_date: date) -> DailyQuestionAttempt | None:
    return db.get(DailyQuestionAttempt, (user_id, for_date))


def load_question(db: Session, question_id: uuid.UUID) -> Question | None:
    """The day's question, fetched by primary key.

    Deliberately *not* through `apply_published_filter`, unlike
    `answer_bank_question`, which fetches that way so a draft or archived
    question 404s instead of handing back its key. Two reasons that would be
    wrong here: the key is only ever revealed for a day the caller already
    holds an attempt on, so **the attempt is the authorisation, not the
    question's status**, and an unanswered day returns no key at all.
    Re-applying the filter would blank out a past day whose question was later
    archived, making a recorded score unreadable -- orphaning exactly the
    history the RESTRICT foreign key exists to protect.
    """
    return db.get(Question, question_id)


def list_calendar(
    db: Session, *, user_id: uuid.UUID, start: date, end: date, today: date
) -> list[tuple[DailyQuestion, DailyQuestionAttempt | None]]:
    """Materialised days in a range, with this caller's attempt on each.

    Clamps to today: future days may exist because an admin pre-booked them,
    and the calendar must not disclose that. One query regardless of span, so
    the cost does not grow with the window.
    """
    if end < start:
        raise ApiError(400, "invalid_request", "end must not be before start")
    if (end - start).days > MAX_CALENDAR_SPAN_DAYS:
        raise ApiError(
            400,
            "invalid_request",
            f"A calendar range may span at most {MAX_CALENDAR_SPAN_DAYS} days",
        )

    capped_end = min(end, today)
    if capped_end < start:
        return []

    rows = db.execute(
        select(DailyQuestion, DailyQuestionAttempt)
        .outerjoin(
            DailyQuestionAttempt,
            (DailyQuestionAttempt.for_date == DailyQuestion.for_date)
            & (DailyQuestionAttempt.user_id == user_id),
        )
        .where(DailyQuestion.for_date >= start, DailyQuestion.for_date <= capped_end)
        .order_by(DailyQuestion.for_date)
    ).all()
    return [(day, attempt) for day, attempt in rows]


def answer_today(
    db: Session,
    *,
    user_id: uuid.UUID,
    question_id: uuid.UUID,
    selected_option_ids: list[str],
    today: date,
    now: datetime,
) -> tuple[DailyQuestionAttempt, Question]:
    """Record this caller's answer to today's question.

    Grades with `grade_answer` directly rather than `grade_and_record`: the
    daily attempt is kept out of `question_progress` on purpose, because that
    table is latest-attempt-wins per question and a rushed daily answer would
    overwrite a better earlier quiz result.
    """
    day = ensure_today(db, today=today)
    if day is None:
        raise ApiError(409, "no_questions_available", "There is no question today")

    # The token check. A stale id means the day rolled over between render and
    # submit, which is recoverable: refetch and answer the new question.
    if day.question_id != question_id:
        raise ApiError(409, "day_rolled_over", "Today's question has changed; reload and retry")

    question = load_question(db, day.question_id)
    if question is None:
        raise ApiError(404, "not_found", "Question not found")

    existing = get_attempt(db, user_id=user_id, for_date=today)
    if existing is not None:
        # Idempotent rather than a 409: a double tap is not an error the
        # person can act on, and they already hold this result.
        return existing, question

    if question.status != QuestionStatus.PUBLISHED:
        # Answering would create new history against a retired question. An
        # admin can override today -- nobody has answered -- and it recovers.
        raise ApiError(409, "question_unavailable", "Today's question is no longer available")

    selected = validate_selection(question, selected_option_ids, require_answer=True)
    points_possible = get_scheme(question.scoring_scheme).max_points
    points, outcome = grade_answer(
        question.scoring_scheme,
        selected,
        question.correct_option_ids,
        [option["id"] for option in question.options],
    )

    attempt = DailyQuestionAttempt(
        user_id=user_id,
        for_date=today,
        question_id=question.id,
        selected_option_ids=selected,
        points_awarded=points,
        points_possible=points_possible,
        outcome=outcome,
        answered_at=now,
    )
    db.add(attempt)
    return attempt, question


def set_day_question(
    db: Session,
    *,
    admin_id: uuid.UUID,
    for_date: date,
    question_id: uuid.UUID | None,
    today: date,
) -> DailyQuestion:
    """Point a day at a question, or redraw it.

    Today and future only. A past day is history: re-pointing it would leave
    people holding a score against a question the day no longer shows. Today
    is changeable only until someone answers, for the same reason -- and the
    attempts table's composite foreign key enforces that independently, so
    this check exists to turn it into a clear 409 rather than an
    IntegrityError.
    """
    if for_date < today:
        raise ApiError(409, "day_closed", "A past day cannot be changed")

    existing = db.get(DailyQuestion, for_date)

    if existing is not None:
        answers = db.scalar(
            select(func.count())
            .select_from(DailyQuestionAttempt)
            .where(DailyQuestionAttempt.for_date == for_date)
        )
        if answers:
            raise ApiError(
                409, "day_answered", "This day has already been answered and cannot be changed"
            )

    if question_id is None:
        question = _draw(db, exclude=existing.question_id if existing else None)
        if question is None:
            raise ApiError(409, "no_questions_available", "There are no published questions")
    else:
        # Through the published filter, unlike the read paths: an admin
        # booking a day must not be able to choose a draft or archived
        # question, since nobody holds an attempt authorising it.
        question = db.scalar(
            apply_published_filter(select(Question), document_ids=None, tag_ids=[]).where(
                Question.id == question_id
            )
        )
        if question is None:
            raise ApiError(404, "not_found", "Question not found")

    if existing is None:
        day = DailyQuestion(for_date=for_date, question_id=question.id, selected_by=admin_id)
        db.add(day)
        return day

    existing.question_id = question.id
    existing.selected_by = admin_id
    return existing


def list_admin_days(db: Session, *, start: date, end: date) -> list[tuple[DailyQuestion, int]]:
    """Days in a range with their answer counts, for the admin console.

    Unlike `list_calendar` this does *not* clamp to today -- planning ahead is
    the whole point of that page.
    """
    if (end - start).days > MAX_CALENDAR_SPAN_DAYS:
        raise ApiError(
            400,
            "invalid_request",
            f"A calendar range may span at most {MAX_CALENDAR_SPAN_DAYS} days",
        )

    counts = (
        select(
            DailyQuestionAttempt.for_date.label("for_date"),
            func.count().label("answers"),
        )
        .group_by(DailyQuestionAttempt.for_date)
        .subquery()
    )
    rows = db.execute(
        select(DailyQuestion, func.coalesce(counts.c.answers, 0))
        .outerjoin(counts, counts.c.for_date == DailyQuestion.for_date)
        .where(DailyQuestion.for_date >= start, DailyQuestion.for_date <= end)
        .order_by(DailyQuestion.for_date)
    ).all()
    return [(day, answers) for day, answers in rows]


def upcoming_range(today: date, days: int) -> tuple[date, date]:
    """The admin console's window: today plus the next `days` days."""
    return today, today + timedelta(days=days)
