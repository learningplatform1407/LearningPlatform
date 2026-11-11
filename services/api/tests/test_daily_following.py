"""How the people you follow did on today's question."""

import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.daily.dependencies import Clock, get_clock
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


def _question(db: Session, author: uuid.UUID) -> None:
    db.add(
        Question(
            external_id=str(uuid.uuid4()),
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
    )
    db.commit()


def _answer(client: TestClient, option: str) -> None:
    today = client.get("/v1/daily-question").json()
    response = client.post(
        "/v1/daily-question/answer",
        json={"question_id": today["question"]["id"], "selected_option_ids": [option]},
    )
    assert response.status_code == 200, response.text


def test_you_see_how_the_people_you_follow_did_after_answering(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    me = make_user("Me")
    ana = make_user("Ana")
    bea = make_user("Bea")
    stranger = make_user("Stranger")
    _question(db_session, ana.id)
    for person in (ana, bea):
        act_as(me).post(f"/v1/users/{person.id}/follow")
    _answer(act_as(ana), "a")
    _answer(act_as(bea), "b")
    _answer(act_as(stranger), "a")

    _answer(act_as(me), "a")
    body = act_as(me).get("/v1/daily-question/following").json()

    assert body["answered_count"] == 2
    assert body["correct_count"] == 1
    assert sorted((row["user"]["display_name"], row["outcome"]) for row in body["answers"]) == [
        ("Ana", "correct"),
        ("Bea", "incorrect"),
    ]
    assert "selected_option_ids" not in body["answers"][0]


def test_it_is_refused_until_you_have_answered(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    me = make_user("Me")
    _question(db_session, me.id)

    response = act_as(me).get("/v1/daily-question/following")

    assert response.status_code == 403
    assert response.json()["code"] == "answer_first"


def test_people_who_went_private_are_left_out(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    me = make_user("Me")
    ana = make_user("Ana")
    _question(db_session, ana.id)
    act_as(me).post(f"/v1/users/{ana.id}/follow")
    _answer(act_as(ana), "a")
    act_as(ana).patch("/v1/me", json={"profile_public": False})

    _answer(act_as(me), "a")
    body = act_as(me).get("/v1/daily-question/following").json()

    assert body == {"answered_count": 0, "correct_count": 0, "answers": []}


def test_the_dated_route_still_reads_dates(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    me = make_user("Me")
    _question(db_session, me.id)

    assert act_as(me).get("/v1/daily-question/2026-10-13").status_code == 200
