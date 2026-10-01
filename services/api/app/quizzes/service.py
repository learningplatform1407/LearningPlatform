"""Session lifecycle, grading, and sampling. See docs/architecture/quizzes.md
§6-§8 for the invariants this module exists to enforce: lazy expiry on every
touch, the session-row-before-questions lock order, snapshot-at-draw-time
scoring, and normalising every datetime read back from the DB before
arithmetic (Postgres hands back aware datetimes, SQLite naive ones, and the
test suite runs on SQLite)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.errors import ApiError, FieldError
from app.progress.service import grade_and_record
from app.questions.constants import Outcome
from app.questions.grading import build_reveal, validate_selection
from app.questions.models import Question
from app.questions.scoring import get_scheme
from app.questions.service import apply_published_filter, resolve_topic_documents
from app.quizzes.constants import (
    HISTORY_LIMIT,
    MAX_DURATION_SECONDS,
    MAX_QUESTION_COUNT,
    MIN_DURATION_SECONDS,
    MIN_QUESTION_COUNT,
    OPEN_STATUSES,
    STALE_AFTER_SECONDS,
    TERMINAL_STATUSES,
    RevealMode,
    SessionStatus,
)
from app.quizzes.models import QuizSession, QuizSessionQuestion
from app.quizzes.schemas import (
    AnswerRequest,
    AnswerSavedResponse,
    QuestionInSessionResponse,
    QuestionResultResponse,
    QuizSessionCreateRequest,
    QuizSessionHistoryItem,
    QuizSessionResponse,
    QuizSessionResultsResponse,
)


def _as_utc(value: datetime) -> datetime:
    """Postgres hands back tz-aware datetimes, SQLite naive ones, and the
    test suite runs on SQLite. Treat a naive value as the UTC it was stored
    as rather than letting the subtraction raise."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _remaining_seconds(session: QuizSession, *, now: datetime) -> int | None:
    if session.duration_seconds is None:
        return None
    # What's left once the current active stretch is excluded — the answer
    # for a paused session, and the fallback below.
    banked = session.duration_seconds - session.accumulated_seconds
    if session.status != SessionStatus.ACTIVE or session.expires_at is None:
        return banked
    # expires_at is the materialised deadline, not re-derived from
    # accumulated_seconds/resumed_at on every read — that's what keeps the
    # sweeper a single indexed query (§5.3), and it's what the lazy expiry
    # check compares against too, so the two can never disagree.
    return int((_as_utc(session.expires_at) - now).total_seconds())


def _recompute_expiry(session: QuizSession, *, now: datetime) -> None:
    """The `now + (duration - accumulated)` formula. Called by start and by
    resume — in two places it will drift, so it exists exactly once."""
    if session.duration_seconds is None:
        session.expires_at = None
        return
    remaining = session.duration_seconds - session.accumulated_seconds
    session.expires_at = now + timedelta(seconds=remaining)


def _load_questions(db: Session, question_ids: list[uuid.UUID]) -> dict[uuid.UUID, Question]:
    if not question_ids:
        return {}
    rows = db.scalars(select(Question).where(Question.id.in_(question_ids)))
    return {q.id: q for q in rows}


def _finalize(
    db: Session, session: QuizSession, status: str, *, now: datetime, grade: bool
) -> None:
    """Marks the session terminal. When `grade` is True: any session_question
    still ungraded (unanswered, or answered under on_finish and never graded
    at answer time) is graded now, and the session-level totals are summed.
    When False (cancel), points stay null — a cancelled session was never
    graded (§7.2). Called by submit, by lazy expiry, and by the sweeper —
    one implementation, three entry points."""
    if grade:
        questions_by_id = _load_questions(db, [sq.question_id for sq in session.questions])
        total_awarded = 0
        total_possible = 0
        for sq in session.questions:
            if sq.points_awarded is None:
                # grade_and_record skips the progress row when nothing was
                # selected, so unanswered questions still score 0 here
                # without being counted as attempted (§5.5).
                points, outcome = grade_and_record(
                    db,
                    user_id=session.user_id,
                    question=questions_by_id[sq.question_id],
                    scoring_scheme=sq.scoring_scheme,
                    points_possible=sq.points_possible,
                    selected_option_ids=sq.selected_option_ids or [],
                    now=now,
                )
                sq.points_awarded = points
                sq.outcome = outcome
            total_awarded += sq.points_awarded
            total_possible += sq.points_possible
        session.points_awarded = total_awarded
        session.points_possible = total_possible

    session.status = status
    session.finished_at = now
    session.resumed_at = None
    session.expires_at = None


def _refresh_session_state(db: Session, session: QuizSession, *, now: datetime) -> None:
    """Runs at the top of every session read and write. Correctness never
    depends on a scheduler running at all — this single helper is what makes
    that true."""
    if session.status != SessionStatus.ACTIVE:
        return
    remaining = _remaining_seconds(session, now=now)
    if remaining is not None and remaining <= 0:
        _finalize(db, session, SessionStatus.EXPIRED, now=now, grade=True)
        db.commit()


def _refresh_open_session(db: Session, user_id: uuid.UUID, *, now: datetime) -> QuizSession | None:
    """The user's one open session, with lazy expiry already applied — so a
    caller only ever sees it still open if it genuinely still is. Shared by
    `/current` and by start, because start is a write and §6.1's rule is
    lazy expiry on *every* touch: without it a session whose deadline passed
    while nobody was looking keeps answering `session_already_open` to every
    new start, and only a read of that dead session can clear it."""
    session = db.execute(
        select(QuizSession)
        .where(QuizSession.user_id == user_id, QuizSession.status.in_(OPEN_STATUSES))
        .with_for_update()
    ).scalar_one_or_none()
    if session is None:
        return None
    _refresh_session_state(db, session, now=now)
    return session


def _validate_bounds(data: QuizSessionCreateRequest) -> None:
    errors: list[FieldError] = []
    if not MIN_QUESTION_COUNT <= data.question_count <= MAX_QUESTION_COUNT:
        errors.append(
            FieldError(
                field="question_count",
                message=f"Must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}",
            )
        )
    if data.duration_seconds is not None and not (
        MIN_DURATION_SECONDS <= data.duration_seconds <= MAX_DURATION_SECONDS
    ):
        errors.append(
            FieldError(
                field="duration_seconds",
                message=(
                    f"Must be between {MIN_DURATION_SECONDS} and {MAX_DURATION_SECONDS}, "
                    "or null for an untimed quiz"
                ),
            )
        )
    if errors:
        raise ApiError(400, "invalid_request", "Quiz session request is out of bounds", errors)


def _get_owned_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> QuizSession:
    # Lock the session row before touching its questions (§8.2) — the only
    # order that can't deadlock against the sweeper. Not-found and
    # belongs-to-someone-else both answer 404, never 403 (§8.3).
    session = db.execute(
        select(QuizSession).where(QuizSession.id == session_id).with_for_update()
    ).scalar_one_or_none()
    if session is None or session.user_id != user_id:
        raise ApiError(404, "not_found", "Quiz session not found")
    return session


def _session_response(db: Session, session: QuizSession, *, now: datetime) -> QuizSessionResponse:
    reveal_points = session.reveal_mode == RevealMode.IMMEDIATE
    questions_by_id = _load_questions(db, [sq.question_id for sq in session.questions])
    items = [
        QuestionInSessionResponse(
            position=sq.position,
            prompt=questions_by_id[sq.question_id].prompt,
            kind=questions_by_id[sq.question_id].kind,
            scoring_scheme=sq.scoring_scheme,
            points_possible=sq.points_possible,
            options=questions_by_id[sq.question_id].options,
            selected_option_ids=sq.selected_option_ids,
            answered_at=sq.answered_at,
            points_awarded=sq.points_awarded if reveal_points else None,
            outcome=sq.outcome if reveal_points else None,
        )
        for sq in session.questions
    ]
    return QuizSessionResponse(
        id=session.id,
        status=session.status,
        reveal_mode=session.reveal_mode,
        question_count=session.question_count,
        duration_seconds=session.duration_seconds,
        remaining_seconds=_remaining_seconds(session, now=now),
        server_time=now,
        points_awarded=session.points_awarded,
        points_possible=session.points_possible,
        finished_at=session.finished_at,
        questions=items,
    )


def _question_result(sq: QuizSessionQuestion, question: Question) -> QuestionResultResponse:
    """The shared reveal, plus the position only a session has."""
    reveal = build_reveal(
        question,
        selected_option_ids=sq.selected_option_ids,
        points_awarded=sq.points_awarded or 0,
        points_possible=sq.points_possible,
        outcome=sq.outcome or Outcome.INCORRECT,
    )
    return QuestionResultResponse(position=sq.position, **reveal.model_dump())


def available_count(
    db: Session, *, document_ids: list[uuid.UUID] | None, tag_ids: list[uuid.UUID]
) -> int:
    query = apply_published_filter(
        select(func.count(Question.id)), document_ids=document_ids, tag_ids=tag_ids
    )
    return db.scalar(query) or 0


def _sample_questions(
    db: Session, *, document_ids: list[uuid.UUID] | None, tag_ids: list[uuid.UUID], count: int
) -> list[Question]:
    # ORDER BY random() is linear in the number of matching rows — accepted
    # up to ~100k questions, revisit only then (§8.4).
    query = apply_published_filter(select(Question), document_ids=document_ids, tag_ids=tag_ids)
    query = query.order_by(func.random()).limit(count)
    return list(db.scalars(query))


def start_session(
    db: Session, user_id: uuid.UUID, data: QuizSessionCreateRequest
) -> QuizSessionResponse:
    _validate_bounds(data)

    now = datetime.now(UTC)
    _refresh_open_session(db, user_id, now=now)

    resolved_document_ids = resolve_topic_documents(
        db,
        chapter_ids=data.chapter_ids,
        sub_chapter_ids=data.sub_chapter_ids,
        document_ids=data.document_ids,
    )
    questions = _sample_questions(
        db,
        document_ids=resolved_document_ids,
        tag_ids=data.tag_ids,
        count=data.question_count,
    )
    if not questions:
        raise ApiError(400, "no_questions_match", "No published questions match this filter")

    session = QuizSession(
        user_id=user_id,
        status=SessionStatus.ACTIVE,
        reveal_mode=data.reveal_mode,
        # Selection verbatim *and* the expansion it produced: the first is
        # intent, the second is what was actually drawn from. `tag_match`
        # versions the semantics, so sessions saved before tags became AND
        # are never retroactively reinterpreted.
        filter_spec={
            "chapter_ids": [str(i) for i in data.chapter_ids],
            "sub_chapter_ids": [str(i) for i in data.sub_chapter_ids],
            "document_ids": [str(i) for i in data.document_ids],
            "resolved_document_ids": [str(i) for i in resolved_document_ids or []],
            "tag_ids": [str(i) for i in data.tag_ids],
            "tag_match": "all",
        },
        question_count=len(questions),
        duration_seconds=data.duration_seconds,
        accumulated_seconds=0,
        resumed_at=now,
        last_activity_at=now,
    )
    _recompute_expiry(session, now=now)
    db.add(session)
    try:
        db.flush()
    except IntegrityError as exc:
        # The partial unique index is the real guard; an uncaught
        # IntegrityError here reaches the catch-all handler in main.py and
        # surfaces a 500 on an ordinary double-clicked Start (§6.2).
        db.rollback()
        raise ApiError(
            409, "session_already_open", "You already have a quiz session in progress"
        ) from exc

    for position, question in enumerate(questions):
        scheme = get_scheme(question.scoring_scheme)
        db.add(
            QuizSessionQuestion(
                session_id=session.id,
                question_id=question.id,
                position=position,
                scoring_scheme=question.scoring_scheme,
                points_possible=scheme.max_points,
            )
        )
    db.commit()
    db.refresh(session)
    return _session_response(db, session, now=now)


def get_current_session(db: Session, user_id: uuid.UUID) -> QuizSessionResponse | None:
    now = datetime.now(UTC)
    session = _refresh_open_session(db, user_id, now=now)
    if session is None or session.status not in OPEN_STATUSES:
        # Either there was none, or the refresh just lazily expired it —
        # "no open session" is the correct answer, not the one that just
        # ended (§7.2). The landing page surfaces that through history.
        return None
    return _session_response(db, session, now=now)


def get_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> QuizSessionResponse:
    session = _get_owned_session(db, session_id, user_id)
    now = datetime.now(UTC)
    _refresh_session_state(db, session, now=now)
    return _session_response(db, session, now=now)


def list_history(db: Session, user_id: uuid.UUID) -> list[QuizSessionHistoryItem]:
    rows = db.scalars(
        select(QuizSession)
        .where(QuizSession.user_id == user_id, QuizSession.status.in_(TERMINAL_STATUSES))
        .order_by(QuizSession.finished_at.desc())
        .limit(HISTORY_LIMIT)
    )
    return [
        QuizSessionHistoryItem(
            id=s.id,
            status=s.status,
            reveal_mode=s.reveal_mode,
            question_count=s.question_count,
            points_awarded=s.points_awarded,
            points_possible=s.points_possible,
            finished_at=s.finished_at,
            created_at=s.created_at,
        )
        for s in rows
    ]


def answer_question(
    db: Session, session_id: uuid.UUID, user_id: uuid.UUID, position: int, data: AnswerRequest
) -> AnswerSavedResponse | QuestionResultResponse:
    session = _get_owned_session(db, session_id, user_id)
    now = datetime.now(UTC)
    _refresh_session_state(db, session, now=now)
    if session.status != SessionStatus.ACTIVE:
        # Paused sessions reject answers too, even though the state diagram
        # doesn't list this transition explicitly: the runner hides the
        # question body while paused (§9.1), and the backend must enforce
        # what the UI merely hides, or pausing becomes a free untimed read.
        raise ApiError(409, "invalid_state", "Session is not active")

    sq = next((q for q in session.questions if q.position == position), None)
    if sq is None:
        raise ApiError(404, "not_found", "Question not found in this session")

    immediate = session.reveal_mode == RevealMode.IMMEDIATE
    if immediate and sq.selected_option_ids is not None:
        raise ApiError(409, "already_answered", "This question has already been answered")

    question = _load_questions(db, [sq.question_id])[sq.question_id]
    # Empty clears the answer under on_finish, but is rejected under
    # immediate, where saving makes it final (§8.5).
    selected = validate_selection(question, data.selected_option_ids, require_answer=immediate)

    sq.selected_option_ids = selected or None
    sq.answered_at = now if selected else None
    session.last_activity_at = now

    if immediate:
        points, outcome = grade_and_record(
            db,
            user_id=session.user_id,
            question=question,
            scoring_scheme=sq.scoring_scheme,
            points_possible=sq.points_possible,
            selected_option_ids=selected,
            now=now,
        )
        sq.points_awarded = points
        sq.outcome = outcome
        db.commit()
        return _question_result(sq, question)

    sq.points_awarded = None
    sq.outcome = None
    db.commit()
    return AnswerSavedResponse()


def pause_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> QuizSessionResponse:
    session = _get_owned_session(db, session_id, user_id)
    now = datetime.now(UTC)
    _refresh_session_state(db, session, now=now)
    if session.status != SessionStatus.ACTIVE:
        raise ApiError(409, "invalid_state", "Session is not active")

    if session.resumed_at is not None:
        session.accumulated_seconds += int((now - _as_utc(session.resumed_at)).total_seconds())
    session.resumed_at = None
    session.expires_at = None
    session.status = SessionStatus.PAUSED
    session.last_activity_at = now
    db.commit()
    return _session_response(db, session, now=now)


def resume_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> QuizSessionResponse:
    session = _get_owned_session(db, session_id, user_id)
    now = datetime.now(UTC)
    _refresh_session_state(db, session, now=now)
    if session.status != SessionStatus.PAUSED:
        raise ApiError(409, "invalid_state", "Session is not paused")

    session.resumed_at = now
    _recompute_expiry(session, now=now)
    session.status = SessionStatus.ACTIVE
    session.last_activity_at = now
    db.commit()
    return _session_response(db, session, now=now)


def cancel_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> QuizSessionResponse:
    session = _get_owned_session(db, session_id, user_id)
    now = datetime.now(UTC)
    _refresh_session_state(db, session, now=now)
    if session.status not in OPEN_STATUSES:
        raise ApiError(409, "invalid_state", "Session is not open")

    session.last_activity_at = now
    _finalize(db, session, SessionStatus.CANCELLED, now=now, grade=False)
    db.commit()
    return _session_response(db, session, now=now)


def submit_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> QuizSessionResponse:
    session = _get_owned_session(db, session_id, user_id)
    now = datetime.now(UTC)
    _refresh_session_state(db, session, now=now)
    if session.status not in OPEN_STATUSES:
        raise ApiError(409, "invalid_state", "Session is not open")

    session.last_activity_at = now
    _finalize(db, session, SessionStatus.COMPLETED, now=now, grade=True)
    db.commit()
    return _session_response(db, session, now=now)


def get_results(
    db: Session, session_id: uuid.UUID, user_id: uuid.UUID
) -> QuizSessionResultsResponse:
    session = _get_owned_session(db, session_id, user_id)
    now = datetime.now(UTC)
    _refresh_session_state(db, session, now=now)
    if session.status not in TERMINAL_STATUSES:
        raise ApiError(409, "results_not_ready", "Session is still open")

    questions_by_id = _load_questions(db, [sq.question_id for sq in session.questions])
    items = [_question_result(sq, questions_by_id[sq.question_id]) for sq in session.questions]
    return QuizSessionResultsResponse(
        id=session.id,
        status=session.status,
        reveal_mode=session.reveal_mode,
        points_awarded=session.points_awarded,
        points_possible=session.points_possible,
        finished_at=session.finished_at,
        questions=items,
    )


def sweep_expired(db: Session, *, now: datetime | None = None) -> int:
    """Sweeps active sessions past their materialised deadline, plus any
    open (active or paused) session stale past STALE_AFTER_SECONDS of
    inactivity — the guard against an untimed, or abandoned-while-paused,
    session wedging the one-open-session index forever (§6.2, §10). One
    session per transaction, session row locked before its questions, same
    order as every other write path (§8.2)."""
    now = now or datetime.now(UTC)
    stale_cutoff = now - timedelta(seconds=STALE_AFTER_SECONDS)

    candidate_ids = db.scalars(
        select(QuizSession.id).where(
            QuizSession.status.in_(OPEN_STATUSES),
            or_(
                and_(
                    QuizSession.status == SessionStatus.ACTIVE,
                    QuizSession.expires_at.isnot(None),
                    QuizSession.expires_at <= now,
                ),
                QuizSession.last_activity_at <= stale_cutoff,
            ),
        )
    ).all()

    swept = 0
    for session_id in candidate_ids:
        session = db.execute(
            select(QuizSession).where(QuizSession.id == session_id).with_for_update()
        ).scalar_one_or_none()
        if session is None or session.status not in OPEN_STATUSES:
            continue
        _finalize(db, session, SessionStatus.EXPIRED, now=now, grade=True)
        db.commit()
        swept += 1
    return swept
