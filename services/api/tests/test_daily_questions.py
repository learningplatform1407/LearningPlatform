"""The question of the day.

Every test pins the date through `app.dependency_overrides[get_clock]` rather
than offsetting from the real clock, which is the whole reason the service
takes `today` as an argument. Without that seam, "which day is it" assertions
would behave differently depending on when CI ran.
"""

import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.daily.dependencies import Clock, get_clock
from app.daily.models import DailyQuestion, DailyQuestionAttempt
from app.main import app
from app.progress.models import QuestionProgress
from app.questions.models import Question
from app.users.models import AccountSettings, Profile

TODAY = date(2026, 10, 13)
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)


@pytest.fixture(autouse=True)
def _pinned_clock() -> Iterator[None]:
    """A fixed institution day for every test in the file."""
    app.dependency_overrides[get_clock] = lambda: Clock(
        now=datetime(2026, 10, 13, 9, 0, tzinfo=UTC), today=TODAY
    )
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_clock, None)


@pytest.fixture
def set_today() -> Callable[[date], None]:
    """Move the pinned day, for the tests that need more than one."""

    def _set(day: date) -> None:
        app.dependency_overrides[get_clock] = lambda: Clock(
            now=datetime(day.year, day.month, day.day, 9, 0, tzinfo=UTC), today=day
        )

    return _set


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.UUID(int=1), email="admin@example.com")


def _profile(db: Session, user: AuthenticatedUser, role: str = "student") -> Profile:
    existing = db.get(Profile, user.id)
    if existing is not None:
        return existing
    profile = Profile(id=user.id, role=role, settings=AccountSettings(user_id=user.id))
    db.add(profile)
    db.commit()
    return profile


@pytest.fixture
def admin_client(
    client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> Iterator[TestClient]:
    # conftest has no admin_client; every suite that needs one defines it.
    _profile(db_session, admin_user, role="admin")
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def _add_question(
    db: Session,
    created_by: uuid.UUID,
    *,
    prompt: str = "Which vessel supplies the SA node?",
    status: str = "published",
    rationale: str = "The RCA supplies it in most people.",
) -> Question:
    question = Question(
        prompt=prompt,
        kind="single",
        scoring_scheme="single_4",
        options=[{"id": "a", "text": "RCA"}, {"id": "b", "text": "LAD"}],
        correct_option_ids=["a"],
        rationales={"a": rationale},
        explanation="Coronary anatomy.",
        difficulty="medium",
        status=status,
        created_by=created_by,
    )
    db.add(question)
    db.commit()
    return question


def _as_student(client: TestClient, user: AuthenticatedUser) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def _answer_today(client: TestClient, *, option: str = "a") -> dict[str, Any]:
    """Open today, then answer whichever question was actually drawn.

    Never assume which one that is. The draw is `ORDER BY random()`, so a test
    that posts a hard-coded id passes or fails on the coin flip -- the token
    check rightly rejects a stale id, no attempt is recorded, and the
    assertion that follows then measures the wrong thing.
    """
    today = client.get("/v1/daily-question").json()
    assert today["question"] is not None, "no question was drawn"
    response = client.post(
        "/v1/daily-question/answer",
        json={"question_id": today["question"]["id"], "selected_option_ids": [option]},
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- reading ---------------------------------------------------------------


def test_requires_auth(client: TestClient) -> None:
    assert client.get("/v1/daily-question").status_code == 401


def test_an_empty_bank_is_a_quiet_empty_state_not_an_error(
    admin_client: TestClient, db_session: Session
) -> None:
    """A fresh deployment has no published questions, and the Learn page must
    not greet everyone with a failure. Nothing is written, so tomorrow can
    still draw."""
    response = admin_client.get("/v1/daily-question")

    assert response.status_code == 200
    body = response.json()
    assert body["question"] is None
    assert body["answerable"] is False
    assert body["server_today"] == TODAY.isoformat()
    assert db_session.scalar(select(func.count()).select_from(DailyQuestion)) == 0


def test_today_materialises_once_and_is_stable(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """The first reader causes the draw; everyone after sees the same row."""
    _add_question(db_session, admin_user.id)

    first = admin_client.get("/v1/daily-question").json()
    second = admin_client.get("/v1/daily-question").json()

    assert first["question"]["id"] == second["question"]["id"]
    assert first["answerable"] is True
    assert db_session.scalar(select(func.count()).select_from(DailyQuestion)) == 1


def test_only_published_questions_are_drawn(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    _add_question(db_session, admin_user.id, prompt="Draft", status="draft")
    _add_question(db_session, admin_user.id, prompt="Archived", status="archived")
    _add_question(db_session, admin_user.id, prompt="Published")

    body = admin_client.get("/v1/daily-question").json()

    assert body["question"]["prompt"] == "Published"


def test_a_second_day_does_not_repeat_until_the_pool_is_exhausted(
    admin_client: TestClient,
    admin_user: AuthenticatedUser,
    db_session: Session,
    set_today: Callable[[date], None],
) -> None:
    """Two questions, two days: different. A third day has no choice but to
    repeat -- a bank of thirty must not stop producing on day thirty-one."""
    _add_question(db_session, admin_user.id, prompt="One")
    _add_question(db_session, admin_user.id, prompt="Two")

    first = admin_client.get("/v1/daily-question").json()["question"]["prompt"]
    set_today(TOMORROW)
    second = admin_client.get("/v1/daily-question").json()["question"]["prompt"]
    assert {first, second} == {"One", "Two"}

    set_today(TOMORROW + timedelta(days=1))
    third = admin_client.get("/v1/daily-question").json()["question"]["prompt"]
    assert third in {"One", "Two"}


def test_a_past_day_never_materialises(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """Drawing for an old date would invent a question that was never that
    day's -- and would let someone open old dates to farm answerable ones."""
    _add_question(db_session, admin_user.id)

    response = admin_client.get(f"/v1/daily-question/{YESTERDAY.isoformat()}")

    assert response.status_code == 404
    assert db_session.scalar(select(func.count()).select_from(DailyQuestion)) == 0


def test_a_future_day_is_404_even_when_an_admin_booked_it(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """404 rather than 403: confirming the row exists would leak that
    tomorrow's question is already set."""
    question = _add_question(db_session, admin_user.id)
    db_session.add(DailyQuestion(for_date=TOMORROW, question_id=question.id))
    db_session.commit()

    response = admin_client.get(f"/v1/daily-question/{TOMORROW.isoformat()}")

    assert response.status_code == 404


# --- the privacy rule ------------------------------------------------------


def test_an_unanswered_day_never_returns_the_answer_key(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """The spec's core rule, in the style of
    test_question_bank_never_returns_the_answer_key.

    A past day this caller did not answer shows the question and nothing else.
    Questions are shared with the exam pool, so revealing the key here would
    burn the question for them in a future quiz.
    """
    question = _add_question(db_session, admin_user.id, rationale="leak me")
    db_session.add(DailyQuestion(for_date=YESTERDAY, question_id=question.id))
    db_session.commit()

    body = admin_client.get(f"/v1/daily-question/{YESTERDAY.isoformat()}").json()

    assert body["question"]["prompt"]
    assert body["attempt"] is None
    assert body["answerable"] is False
    for leaked in ("correct_option_ids", "rationales", "explanation"):
        assert leaked not in body["question"]
    assert "leak me" not in str(body)


def test_answering_reveals_the_key_and_the_reasoning(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    question = _add_question(db_session, admin_user.id, rationale="Because the RCA does.")
    admin_client.get("/v1/daily-question")

    response = admin_client.post(
        "/v1/daily-question/answer",
        json={"question_id": str(question.id), "selected_option_ids": ["a"]},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["attempt"]["outcome"] == "correct"
    assert body["attempt"]["points_awarded"] == 4
    assert body["answerable"] is False
    rationales = [option["rationale"] for option in body["attempt"]["options"]]
    assert "Because the RCA does." in rationales


def test_answering_does_not_touch_question_progress(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """question_progress is latest-attempt-wins per (user, question), so
    recording a daily answer there would overwrite a better quiz result."""
    _add_question(db_session, admin_user.id)

    _answer_today(admin_client)

    assert db_session.scalar(select(func.count()).select_from(QuestionProgress)) == 0


# --- answering -------------------------------------------------------------


def test_a_second_answer_returns_the_first_rather_than_regrading(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """A double tap is not an error the person can act on."""
    question = _add_question(db_session, admin_user.id)
    admin_client.get("/v1/daily-question")

    first = admin_client.post(
        "/v1/daily-question/answer",
        json={"question_id": str(question.id), "selected_option_ids": ["a"]},
    ).json()
    second = admin_client.post(
        "/v1/daily-question/answer",
        json={"question_id": str(question.id), "selected_option_ids": ["b"]},
    )

    assert second.status_code == 200
    # The wrong second answer did not overwrite the right first one.
    assert second.json()["attempt"]["outcome"] == first["attempt"]["outcome"] == "correct"
    assert db_session.scalar(select(func.count()).select_from(DailyQuestionAttempt)) == 1


def test_a_stale_question_id_is_a_recoverable_conflict(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """The midnight straddle: rendered at 23:59:58, submitted at 00:00:01.

    The answer is neither lost nor misrecorded against the new day -- the
    client is told to refetch.
    """
    _add_question(db_session, admin_user.id)
    admin_client.get("/v1/daily-question")

    response = admin_client.post(
        "/v1/daily-question/answer",
        json={"question_id": str(uuid.uuid4()), "selected_option_ids": ["a"]},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "day_rolled_over"


def test_an_archived_question_cannot_be_answered_but_still_reads(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """A day keeps rendering after its question is retired -- the read path
    fetches by primary key on purpose -- but no new history is created
    against it."""
    question = _add_question(db_session, admin_user.id)
    admin_client.get("/v1/daily-question")
    question.status = "archived"
    db_session.commit()

    read = admin_client.get("/v1/daily-question")
    assert read.status_code == 200
    assert read.json()["question"]["prompt"]
    assert read.json()["answerable"] is False

    answered = admin_client.post(
        "/v1/daily-question/answer",
        json={"question_id": str(question.id), "selected_option_ids": ["a"]},
    )
    assert answered.status_code == 409
    assert answered.json()["code"] == "question_unavailable"


def test_a_past_day_cannot_be_answered_at_all(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """No endpoint takes a date, so "answer a past day" is not expressible --
    the only way to try is with that day's question id, which the token check
    rejects."""
    question = _add_question(db_session, admin_user.id, prompt="Yesterday's")
    _add_question(db_session, admin_user.id, prompt="Today's")
    db_session.add(DailyQuestion(for_date=YESTERDAY, question_id=question.id))
    db_session.commit()

    response = admin_client.post(
        "/v1/daily-question/answer",
        json={"question_id": str(question.id), "selected_option_ids": ["a"]},
    )

    assert response.status_code == 409
    assert db_session.get(DailyQuestionAttempt, (admin_user.id, YESTERDAY)) is None


# --- the calendar ----------------------------------------------------------


def test_the_calendar_reports_past_days_and_outcomes(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    question = _add_question(db_session, admin_user.id)
    db_session.add(DailyQuestion(for_date=YESTERDAY, question_id=question.id))
    db_session.flush()
    db_session.add(
        DailyQuestionAttempt(
            user_id=admin_user.id,
            for_date=YESTERDAY,
            question_id=question.id,
            selected_option_ids=["b"],
            points_awarded=0,
            points_possible=4,
            outcome="incorrect",
            answered_at=datetime(2026, 10, 12, 10, 0, tzinfo=UTC),
        )
    )
    db_session.commit()

    body = admin_client.get(
        "/v1/daily-question/calendar",
        params={"start": (TODAY - timedelta(days=7)).isoformat(), "end": TODAY.isoformat()},
    ).json()

    assert body["server_today"] == TODAY.isoformat()
    days = {day["for_date"]: day for day in body["days"]}
    assert days[YESTERDAY.isoformat()] == {
        "for_date": YESTERDAY.isoformat(),
        "answered": True,
        "outcome": "incorrect",
    }


def test_the_calendar_never_discloses_a_booked_future_day(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    question = _add_question(db_session, admin_user.id)
    db_session.add(DailyQuestion(for_date=TOMORROW, question_id=question.id))
    db_session.commit()

    body = admin_client.get(
        "/v1/daily-question/calendar",
        params={"start": TODAY.isoformat(), "end": (TODAY + timedelta(days=30)).isoformat()},
    ).json()

    assert [day["for_date"] for day in body["days"]] == []


def test_the_calendar_rejects_an_unbounded_span(admin_client: TestClient) -> None:
    response = admin_client.get(
        "/v1/daily-question/calendar",
        params={"start": "2020-01-01", "end": TODAY.isoformat()},
    )

    assert response.status_code == 400


def test_the_calendar_costs_the_same_for_a_month_as_a_quarter(
    admin_client: TestClient,
    admin_user: AuthenticatedUser,
    db_session: Session,
    count_queries: Callable[[], Any],
) -> None:
    question = _add_question(db_session, admin_user.id)
    for offset in range(1, 60):
        db_session.add(
            DailyQuestion(for_date=TODAY - timedelta(days=offset), question_id=question.id)
        )
    db_session.commit()

    with count_queries() as month:
        admin_client.get(
            "/v1/daily-question/calendar",
            params={"start": (TODAY - timedelta(days=30)).isoformat(), "end": TODAY.isoformat()},
        )
    with count_queries() as quarter:
        admin_client.get(
            "/v1/daily-question/calendar",
            params={"start": (TODAY - timedelta(days=90)).isoformat(), "end": TODAY.isoformat()},
        )

    assert month[0] == quarter[0]


# --- the admin override ----------------------------------------------------


def test_a_learner_cannot_override(
    admin_client: TestClient, authenticated_user: AuthenticatedUser, db_session: Session
) -> None:
    _profile(db_session, authenticated_user)
    _as_student(admin_client, authenticated_user)

    response = admin_client.put(
        f"/v1/admin/daily-question/{TOMORROW.isoformat()}", json={"question_id": None}
    )

    assert response.status_code == 403


def test_an_admin_books_a_future_day(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    question = _add_question(db_session, admin_user.id)

    response = admin_client.put(
        f"/v1/admin/daily-question/{TOMORROW.isoformat()}",
        json={"question_id": str(question.id)},
    )

    assert response.status_code == 200, response.text
    assert response.json()["overridden"] is True
    assert db_session.get(DailyQuestion, TOMORROW) is not None


def test_an_admin_can_redraw_today_until_someone_answers(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    _add_question(db_session, admin_user.id, prompt="One")
    _add_question(db_session, admin_user.id, prompt="Two")
    first = admin_client.get("/v1/daily-question").json()["question"]["prompt"]

    redrawn = admin_client.put(
        f"/v1/admin/daily-question/{TODAY.isoformat()}", json={"question_id": None}
    )

    assert redrawn.status_code == 200, redrawn.text
    assert redrawn.json()["question"]["prompt"] != first


def test_today_cannot_be_changed_once_answered(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """Re-pointing it would leave that answer attached to a question the day
    no longer shows."""
    _add_question(db_session, admin_user.id, prompt="One")
    _add_question(db_session, admin_user.id, prompt="Two")
    # Answers whatever was drawn -- posting a hard-coded id here made this
    # test a coin flip, since a stale id is correctly refused and then no
    # attempt exists for the override to trip over.
    _answer_today(admin_client)

    response = admin_client.put(
        f"/v1/admin/daily-question/{TODAY.isoformat()}", json={"question_id": None}
    )

    assert response.status_code == 409
    assert response.json()["code"] == "day_answered"


def test_a_past_day_cannot_be_overridden(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    question = _add_question(db_session, admin_user.id)

    response = admin_client.put(
        f"/v1/admin/daily-question/{YESTERDAY.isoformat()}",
        json={"question_id": str(question.id)},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "day_closed"


def test_an_admin_cannot_book_an_unpublished_question(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    """Unlike the read paths, the override goes through the published filter:
    nobody holds an attempt authorising a draft."""
    draft = _add_question(db_session, admin_user.id, status="draft")

    response = admin_client.put(
        f"/v1/admin/daily-question/{TOMORROW.isoformat()}",
        json={"question_id": str(draft.id)},
    )

    assert response.status_code == 404


def test_the_admin_list_shows_answer_counts_and_changeability(
    admin_client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> None:
    _add_question(db_session, admin_user.id)
    _answer_today(admin_client)

    body = admin_client.get("/v1/admin/daily-question").json()

    today_row = next(day for day in body["days"] if day["for_date"] == TODAY.isoformat())
    assert today_row["answer_count"] == 1
    assert today_row["can_change"] is False
