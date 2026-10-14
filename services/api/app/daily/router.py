from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.daily.constants import ADMIN_HORIZON_DAYS
from app.daily.dependencies import Clock, get_clock
from app.daily.models import DailyQuestion, DailyQuestionAttempt
from app.daily.schemas import (
    DailyAnswerRequest,
    DailyQuestionAdminDay,
    DailyQuestionAdminResponse,
    DailyQuestionCalendarResponse,
    DailyQuestionDay,
    DailyQuestionOverrideRequest,
    DailyQuestionPrompt,
    DailyQuestionResponse,
)
from app.daily.service import (
    answer_today,
    ensure_today,
    get_attempt,
    get_day,
    list_admin_days,
    list_calendar,
    load_question,
    set_day_question,
    upcoming_range,
)
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.questions.constants import QuestionStatus
from app.questions.grading import build_reveal
from app.questions.models import Question
from app.questions.scoring import get_scheme
from app.users.service import get_or_create_profile

router = APIRouter(prefix="/v1/daily-question", tags=["daily-question"])

# A separate router rather than per-route dependencies, the shape
# app/feed/router.py uses: every route here is admin-gated, so the gate
# belongs where it cannot be forgotten on a later addition.
admin_router = APIRouter(
    prefix="/v1/admin/daily-question",
    tags=["daily-question"],
    dependencies=[Depends(require_admin)],
)


def _prompt(question: Question) -> DailyQuestionPrompt:
    return DailyQuestionPrompt(
        id=question.id,
        prompt=question.prompt,
        kind=question.kind,
        difficulty=question.difficulty,
        points_possible=get_scheme(question.scoring_scheme).max_points,
        options=question.options,
    )


def _day_response(
    *,
    for_date: date,
    today: date,
    question: Question | None,
    attempt: DailyQuestionAttempt | None,
) -> DailyQuestionResponse:
    """The single place the answer key is or is not attached.

    `attempt` is populated only when this caller actually answered, and
    `build_reveal` is the only serialiser in the codebase that emits the key --
    so "answered" is structurally the condition for seeing it, rather than a
    flag this could get wrong.
    """
    reveal = None
    if attempt is not None and question is not None:
        reveal = build_reveal(
            question,
            selected_option_ids=list(attempt.selected_option_ids),
            points_awarded=attempt.points_awarded,
            points_possible=attempt.points_possible,
            outcome=attempt.outcome,
        )

    answerable = (
        for_date == today
        and attempt is None
        and question is not None
        and question.status == QuestionStatus.PUBLISHED
    )

    return DailyQuestionResponse(
        for_date=for_date,
        server_today=today,
        answerable=answerable,
        question=_prompt(question) if question is not None else None,
        attempt=reveal,
    )


@router.get("", response_model=DailyQuestionResponse)
def read_today(
    user: AuthenticatedUser = Depends(get_current_user),
    clock: Clock = Depends(get_clock),
    db: Session = Depends(get_db),
) -> DailyQuestionResponse:
    """Today's question, drawing it if nobody has opened the day yet.

    A write on a read path, which is precedented: `_refresh_session_state`
    commits inside a quiz-session read for the same reason -- there is no
    scheduler to have done it beforehand.
    """
    profile = get_or_create_profile(db, user)
    day = ensure_today(db, today=clock.today)
    question = load_question(db, day.question_id) if day is not None else None
    attempt = get_attempt(db, user_id=profile.id, for_date=clock.today)
    db.commit()
    return _day_response(
        for_date=clock.today, today=clock.today, question=question, attempt=attempt
    )


# Declared before /{for_date}: that path parameter is typed `date`, so a
# static route after it would 422 on "calendar" rather than fall through.
@router.get("/calendar", response_model=DailyQuestionCalendarResponse)
def read_calendar(
    start: date = Query(...),
    end: date = Query(...),
    user: AuthenticatedUser = Depends(get_current_user),
    clock: Clock = Depends(get_clock),
    db: Session = Depends(get_db),
) -> DailyQuestionCalendarResponse:
    profile = get_or_create_profile(db, user)
    db.commit()
    rows = list_calendar(db, user_id=profile.id, start=start, end=end, today=clock.today)
    return DailyQuestionCalendarResponse(
        server_today=clock.today,
        days=[
            DailyQuestionDay(
                for_date=day.for_date,
                answered=attempt is not None,
                outcome=attempt.outcome if attempt is not None else None,
            )
            for day, attempt in rows
        ],
    )


@router.get("/{for_date}", response_model=DailyQuestionResponse)
def read_day(
    for_date: date,
    user: AuthenticatedUser = Depends(get_current_user),
    clock: Clock = Depends(get_clock),
    db: Session = Depends(get_db),
) -> DailyQuestionResponse:
    profile = get_or_create_profile(db, user)
    day = get_day(db, for_date, today=clock.today)
    if day is None:
        db.commit()
        raise ApiError(404, "not_found", "No question for that day")
    question = load_question(db, day.question_id)
    attempt = get_attempt(db, user_id=profile.id, for_date=for_date)
    db.commit()
    return _day_response(for_date=for_date, today=clock.today, question=question, attempt=attempt)


@router.post("/answer", response_model=DailyQuestionResponse)
def submit_answer(
    data: DailyAnswerRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    clock: Clock = Depends(get_clock),
    db: Session = Depends(get_db),
) -> DailyQuestionResponse:
    """No date in the path, deliberately -- see DailyAnswerRequest."""
    # A learner can reach this without ever calling GET /v1/me, and
    # daily_question_attempts.user_id references profiles.id.
    profile = get_or_create_profile(db, user)
    attempt, question = answer_today(
        db,
        user_id=profile.id,
        question_id=data.question_id,
        selected_option_ids=data.selected_option_ids,
        today=clock.today,
        now=clock.now,
    )
    db.commit()
    return _day_response(
        for_date=clock.today, today=clock.today, question=question, attempt=attempt
    )


@admin_router.get("", response_model=DailyQuestionAdminResponse)
def read_admin_days(
    clock: Clock = Depends(get_clock),
    db: Session = Depends(get_db),
) -> DailyQuestionAdminResponse:
    start, end = upcoming_range(clock.today, ADMIN_HORIZON_DAYS)
    rows = list_admin_days(db, start=start, end=end)
    days: list[DailyQuestionAdminDay] = []
    for day, answers in rows:
        question = load_question(db, day.question_id)
        days.append(
            DailyQuestionAdminDay(
                for_date=day.for_date,
                question=_prompt(question) if question is not None else None,
                overridden=day.selected_by is not None,
                answer_count=answers,
                can_change=answers == 0,
            )
        )
    # The horizon travels with the response so the console does not hard-code
    # its own copy: a window drawn from a different number than the one these
    # rows cover would silently hide days, or show days the endpoint never
    # returns.
    return DailyQuestionAdminResponse(
        server_today=clock.today, horizon_days=ADMIN_HORIZON_DAYS, days=days
    )


@admin_router.put("/{for_date}", response_model=DailyQuestionAdminDay)
def override_day(
    for_date: date,
    data: DailyQuestionOverrideRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    clock: Clock = Depends(get_clock),
    db: Session = Depends(get_db),
) -> DailyQuestionAdminDay:
    profile = get_or_create_profile(db, user)
    day: DailyQuestion = set_day_question(
        db,
        admin_id=profile.id,
        for_date=for_date,
        question_id=data.question_id,
        today=clock.today,
    )
    db.commit()
    db.refresh(day)
    question = load_question(db, day.question_id)
    return DailyQuestionAdminDay(
        for_date=day.for_date,
        question=_prompt(question) if question is not None else None,
        overridden=day.selected_by is not None,
        # set_day_question refuses a day that has answers, so a successful
        # override always lands on an unanswered one.
        answer_count=0,
        can_change=True,
    )
