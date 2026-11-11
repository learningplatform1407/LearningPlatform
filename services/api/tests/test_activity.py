import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.activity.models import ActivityEvent
from app.activity.recording import is_streak_milestone
from app.auth.schemas import AuthenticatedUser
from app.daily.dependencies import Clock, get_clock
from app.documents.models import Document
from app.main import app
from app.questions.models import Question
from tests.conftest import MakeUser

ActAs = Callable[[AuthenticatedUser], TestClient]
TODAY = date(2026, 10, 13)


@pytest.fixture(autouse=True)
def _pinned_clock() -> Iterator[None]:
    app.dependency_overrides[get_clock] = lambda: Clock(
        now=datetime(2026, 10, 13, 9, 0, tzinfo=UTC), today=TODAY
    )
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_clock, None)


def _set_today(day: date) -> None:
    app.dependency_overrides[get_clock] = lambda: Clock(
        now=datetime(day.year, day.month, day.day, 9, 0, tzinfo=UTC), today=day
    )


def _lesson(db: Session, author: uuid.UUID, title: str = "Cardiology 2") -> Document:
    document = Document(title=title, created_by=author)
    db.add(document)
    db.commit()
    return document


def _question(db: Session, author: uuid.UUID, document_id: uuid.UUID | None = None) -> Question:
    question = Question(
        external_id=str(uuid.uuid4()),
        document_id=document_id,
        prompt="Which vessel supplies the SA node?",
        kind="single",
        scoring_scheme="single_4",
        options=[{"id": "a", "text": "RCA"}, {"id": "b", "text": "LAD"}],
        correct_option_ids=["a"],
        rationales={},
        explanation="Coronary anatomy.",
        status="published",
        created_by=author,
    )
    db.add(question)
    db.commit()
    return question


def _answer(client: TestClient, question: Question, option: str) -> None:
    response = client.post(
        f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": [option]}
    )
    assert response.status_code == 200, response.text


def _answer_daily(client: TestClient) -> None:
    today = client.get("/v1/daily-question").json()
    response = client.post(
        "/v1/daily-question/answer",
        json={"question_id": today["question"]["id"], "selected_option_ids": ["a"]},
    )
    assert response.status_code == 200, response.text


def _events(db: Session) -> list[ActivityEvent]:
    return list(db.scalars(select(ActivityEvent)))


# --- what gets recorded -----------------------------------------------------


def test_completing_a_lesson_is_recorded_once(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    ana = make_user("Ana")
    lesson = _lesson(db_session, ana.id)
    first = _question(db_session, ana.id, lesson.id)
    second = _question(db_session, ana.id, lesson.id)
    client = act_as(ana)

    _answer(client, first, "a")
    _answer(client, second, "a")
    _answer(client, first, "a")

    events = _events(db_session)
    assert [(event.kind, event.subject_id) for event in events] == [("lesson_completed", lesson.id)]


def test_falling_under_the_threshold_and_back_does_not_repeat_the_event(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    ana = make_user("Ana")
    lesson = _lesson(db_session, ana.id)
    question = _question(db_session, ana.id, lesson.id)
    client = act_as(ana)

    _answer(client, question, "a")
    _answer(client, question, "b")
    _answer(client, question, "a")

    assert len(_events(db_session)) == 1


def test_a_wrong_answer_records_nothing(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    ana = make_user("Ana")
    lesson = _lesson(db_session, ana.id)
    _answer(act_as(ana), _question(db_session, ana.id, lesson.id), "b")

    assert _events(db_session) == []


def test_finishing_an_exam_is_recorded_with_its_score(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    ana = make_user("Ana")
    _question(db_session, ana.id)
    client = act_as(ana)
    session = client.post(
        "/v1/quiz-sessions", json={"question_count": 1, "reveal_mode": "on_finish"}
    ).json()
    client.put(f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["a"]})

    client.post(f"/v1/quiz-sessions/{session['id']}/submit")

    [event] = _events(db_session)
    assert event.kind == "exam_completed"
    assert str(event.subject_id) == session["id"]
    assert event.payload == {"score_percent": 100.0, "question_count": 1}


def test_a_cancelled_exam_records_nothing(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    ana = make_user("Ana")
    _question(db_session, ana.id)
    client = act_as(ana)
    session = client.post(
        "/v1/quiz-sessions", json={"question_count": 1, "reveal_mode": "on_finish"}
    ).json()

    client.post(f"/v1/quiz-sessions/{session['id']}/cancel")

    assert _events(db_session) == []


def test_a_three_day_streak_is_recorded_but_two_days_are_not(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    ana = make_user("Ana")
    _question(db_session, ana.id)
    client = act_as(ana)

    for offset in (2, 1):
        _set_today(TODAY - timedelta(days=offset))
        _answer_daily(client)
    assert _events(db_session) == []

    _set_today(TODAY)
    _answer_daily(client)

    [event] = _events(db_session)
    assert event.kind == "streak_milestone"
    assert event.payload == {"days": 3}


@pytest.mark.parametrize(
    ("days", "expected"),
    [(2, False), (3, True), (7, True), (8, False), (100, True), (150, False), (300, True)],
)
def test_streak_milestones(days: int, expected: bool) -> None:
    assert is_streak_milestone(days) is expected


# --- who sees it ------------------------------------------------------------


def test_followers_see_what_the_people_they_follow_did(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    stranger = make_user("Stranger")
    lesson = _lesson(db_session, ana.id)
    _answer(act_as(ana), _question(db_session, ana.id, lesson.id), "a")
    _answer(act_as(stranger), _question(db_session, ana.id, lesson.id), "a")
    act_as(viewer).post(f"/v1/users/{ana.id}/follow")

    body = act_as(viewer).get("/v1/me/activity").json()

    assert len(body) == 1
    assert body[0]["kind"] == "lesson_completed"
    assert body[0]["user"]["display_name"] == "Ana"
    assert body[0]["document_id"] == str(lesson.id)
    assert body[0]["document_title"] == "Cardiology 2"


def test_activity_is_hidden_while_the_author_is_private_and_shown_once_public(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    act_as(viewer).post(f"/v1/users/{ana.id}/follow")
    act_as(ana).patch("/v1/me", json={"profile_public": False})
    lesson = _lesson(db_session, ana.id)
    _answer(act_as(ana), _question(db_session, ana.id, lesson.id), "a")

    assert act_as(viewer).get("/v1/me/activity").json() == []
    assert act_as(viewer).get(f"/v1/users/{ana.id}/activity").status_code == 404

    act_as(ana).patch("/v1/me", json={"profile_public": True})

    assert len(act_as(viewer).get("/v1/me/activity").json()) == 1
    assert len(act_as(viewer).get(f"/v1/users/{ana.id}/activity").json()) == 1


def test_a_public_profile_shows_its_own_activity_to_anyone(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    lesson = _lesson(db_session, ana.id)
    _answer(act_as(ana), _question(db_session, ana.id, lesson.id), "a")

    body = act_as(viewer).get(f"/v1/users/{ana.id}/activity").json()

    assert [event["kind"] for event in body] == ["lesson_completed"]


def test_an_event_about_a_deleted_lesson_drops_out(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    act_as(viewer).post(f"/v1/users/{ana.id}/follow")
    lesson = _lesson(db_session, ana.id)
    question = _question(db_session, ana.id, lesson.id)
    _answer(act_as(ana), question, "a")

    db_session.delete(question)
    db_session.delete(lesson)
    db_session.commit()

    assert act_as(viewer).get("/v1/me/activity").json() == []


def test_the_feed_is_newest_first_and_pages_backwards(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    viewer = make_user("Viewer")
    ana = make_user("Ana")
    act_as(viewer).post(f"/v1/users/{ana.id}/follow")
    for index in range(3):
        db_session.add(
            ActivityEvent(
                user_id=ana.id,
                kind="streak_milestone",
                payload={"days": 3 + index},
                created_at=datetime(2026, 10, 10 + index, tzinfo=UTC),
            )
        )
    db_session.commit()
    client = act_as(viewer)

    first_page = client.get("/v1/me/activity", params={"limit": 2}).json()
    second_page = client.get(
        "/v1/me/activity", params={"limit": 2, "before": first_page[-1]["created_at"]}
    ).json()

    assert [event["streak_days"] for event in first_page] == [5, 4]
    assert [event["streak_days"] for event in second_page] == [3]


def test_activity_requires_auth(client: TestClient) -> None:
    assert client.get("/v1/me/activity").status_code == 401
