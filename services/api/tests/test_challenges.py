import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.activity.models import ActivityEvent
from app.auth.schemas import AuthenticatedUser
from app.challenges.models import Challenge
from app.questions.models import Question
from app.quizzes.models import QuizSession, QuizSessionQuestion
from tests.conftest import MakeUser

ActAs = Callable[[AuthenticatedUser], TestClient]


def _question(db: Session, author: uuid.UUID, prompt: str) -> Question:
    question = Question(
        external_id=str(uuid.uuid4()),
        prompt=prompt,
        kind="single",
        scoring_scheme="single_4",
        options=[{"id": "a", "text": "Right"}, {"id": "b", "text": "Wrong"}],
        correct_option_ids=["a"],
        rationales={},
        explanation="Because.",
        status="published",
        created_by=author,
    )
    db.add(question)
    db.commit()
    return question


def _take_exam(client: TestClient, answers: list[str], **overrides: object) -> dict:
    payload = {"question_count": len(answers), "reveal_mode": "on_finish", **overrides}
    session = client.post("/v1/quiz-sessions", json=payload).json()
    for position, option in enumerate(answers):
        client.put(
            f"/v1/quiz-sessions/{session['id']}/answers/{position}",
            json={"selected_option_ids": [option]},
        )
    client.post(f"/v1/quiz-sessions/{session['id']}/submit")
    return session


def _follow_each_other(act_as: ActAs, a: AuthenticatedUser, b: AuthenticatedUser) -> None:
    act_as(a).post(f"/v1/users/{b.id}/follow")
    act_as(b).post(f"/v1/users/{a.id}/follow")


@pytest.fixture
def pair(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> tuple[AuthenticatedUser, AuthenticatedUser]:
    """Ana and Bea follow each other; there are three published questions."""
    ana = make_user("Ana")
    bea = make_user("Bea")
    _follow_each_other(act_as, ana, bea)
    for index in range(3):
        _question(db_session, ana.id, f"Question {index}")
    return ana, bea


def _challenge(act_as: ActAs, ana: AuthenticatedUser, bea: AuthenticatedUser) -> dict:
    session = _take_exam(act_as(ana), ["a", "a", "b"])
    response = act_as(ana).post(
        "/v1/challenges", json={"session_id": session["id"], "user_id": str(bea.id)}
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- sending ----------------------------------------------------------------


def test_sending_a_finished_exam_to_a_mutual_follow(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs
) -> None:
    ana, bea = pair

    body = _challenge(act_as, ana, bea)

    assert body["status"] == "pending"
    assert body["direction"] == "sent"
    assert body["opponent"]["display_name"] == "Bea"
    assert body["question_count"] == 3
    assert body["your_score_percent"] == pytest.approx(66.7)
    assert body["opponent_score_percent"] is None


def test_only_mutual_follows_can_be_challenged(
    make_user: MakeUser, act_as: ActAs, db_session: Session
) -> None:
    ana = make_user("Ana")
    fan = make_user("Fan")
    _question(db_session, ana.id, "Q")
    act_as(ana).post(f"/v1/users/{fan.id}/follow")  # one way only
    session = _take_exam(act_as(ana), ["a"])

    response = act_as(ana).post(
        "/v1/challenges", json={"session_id": session["id"], "user_id": str(fan.id)}
    )

    assert response.status_code == 403
    assert response.json()["code"] == "not_mutual_follow"


def test_a_private_learner_cannot_be_challenged_even_if_mutual(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs
) -> None:
    ana, bea = pair
    act_as(bea).patch("/v1/me", json={"profile_public": False})
    session = _take_exam(act_as(ana), ["a"], question_count=1)

    response = act_as(ana).post(
        "/v1/challenges", json={"session_id": session["id"], "user_id": str(bea.id)}
    )

    assert response.status_code == 403


def test_an_unfinished_or_someone_elses_exam_cannot_be_sent(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs
) -> None:
    ana, bea = pair
    open_session = (
        act_as(ana)
        .post("/v1/quiz-sessions", json={"question_count": 1, "reveal_mode": "on_finish"})
        .json()
    )

    unfinished = act_as(ana).post(
        "/v1/challenges", json={"session_id": open_session["id"], "user_id": str(bea.id)}
    )
    not_mine = act_as(bea).post(
        "/v1/challenges", json={"session_id": open_session["id"], "user_id": str(ana.id)}
    )

    assert unfinished.status_code == 409
    assert unfinished.json()["code"] == "session_not_finished"
    assert not_mine.status_code == 404


def test_the_same_exam_goes_to_the_same_person_once(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs
) -> None:
    ana, bea = pair
    session = _take_exam(act_as(ana), ["a"], question_count=1)
    payload = {"session_id": session["id"], "user_id": str(bea.id)}

    assert act_as(ana).post("/v1/challenges", json=payload).status_code == 200
    second = act_as(ana).post("/v1/challenges", json=payload)

    assert second.status_code == 409
    assert second.json()["code"] == "already_challenged"


def test_you_cannot_challenge_yourself(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs
) -> None:
    ana, _ = pair
    session = _take_exam(act_as(ana), ["a"], question_count=1)

    response = act_as(ana).post(
        "/v1/challenges", json={"session_id": session["id"], "user_id": str(ana.id)}
    )

    assert response.status_code == 400


# --- answering --------------------------------------------------------------


def test_accepting_replays_the_same_questions_in_the_same_order(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs, db_session: Session
) -> None:
    ana, bea = pair
    sent = _challenge(act_as, ana, bea)

    incoming = act_as(bea).get("/v1/me/challenges").json()
    assert [(c["id"], c["direction"]) for c in incoming] == [(sent["id"], "incoming")]
    # The score to beat stays hidden until Bea has answered.
    assert incoming[0]["opponent_score_percent"] is None

    session = act_as(bea).post(f"/v1/challenges/{sent['id']}/accept").json()

    def draw(session_id: str) -> list[uuid.UUID]:
        return list(
            db_session.scalars(
                select(QuizSessionQuestion.question_id)
                .where(QuizSessionQuestion.session_id == uuid.UUID(session_id))
                .order_by(QuizSessionQuestion.position)
            )
        )

    challenge = db_session.get(Challenge, uuid.UUID(sent["id"]))
    assert challenge is not None
    assert draw(session["id"]) == draw(str(challenge.source_session_id))
    assert act_as(bea).get(f"/v1/challenges/{sent['id']}").json()["status"] == "accepted"


def test_finishing_the_challenge_compares_both_attempts(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs, db_session: Session
) -> None:
    ana, bea = pair
    sent = _challenge(act_as, ana, bea)
    session = act_as(bea).post(f"/v1/challenges/{sent['id']}/accept").json()
    for position in range(3):
        act_as(bea).put(
            f"/v1/quiz-sessions/{session['id']}/answers/{position}",
            json={"selected_option_ids": ["a"]},
        )

    act_as(bea).post(f"/v1/quiz-sessions/{session['id']}/submit")

    theirs = act_as(bea).get(f"/v1/challenges/{sent['id']}").json()
    mine = act_as(ana).get(f"/v1/challenges/{sent['id']}").json()
    assert theirs["status"] == "completed"
    assert theirs["your_score_percent"] == 100.0
    assert theirs["opponent_score_percent"] == pytest.approx(66.7)
    assert mine["opponent_score_percent"] == 100.0
    assert [(q["your_outcome"], q["opponent_outcome"]) for q in mine["questions"]] == [
        ("correct", "correct"),
        ("correct", "correct"),
        ("incorrect", "correct"),
    ]
    kinds = db_session.scalars(
        select(ActivityEvent.kind).where(ActivityEvent.kind == "challenge_completed")
    ).all()
    assert len(kinds) == 2


def test_the_challenge_shows_in_followers_activity_while_both_are_public(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs, make_user: MakeUser
) -> None:
    ana, bea = pair
    viewer = make_user("Viewer")
    act_as(viewer).post(f"/v1/users/{ana.id}/follow")
    sent = _challenge(act_as, ana, bea)
    session = act_as(bea).post(f"/v1/challenges/{sent['id']}/accept").json()
    act_as(bea).post(f"/v1/quiz-sessions/{session['id']}/submit")

    [event] = [
        e
        for e in act_as(viewer).get("/v1/me/activity").json()
        if e["kind"] == "challenge_completed"
    ]
    assert event["user"]["display_name"] == "Ana"
    assert event["opponent"]["display_name"] == "Bea"
    assert event["score_percent"] == pytest.approx(66.7)
    assert event["opponent_score_percent"] == 0.0

    act_as(bea).patch("/v1/me", json={"profile_public": False})

    assert not [
        e
        for e in act_as(viewer).get("/v1/me/activity").json()
        if e["kind"] == "challenge_completed"
    ]


def test_accepting_while_another_exam_is_open_is_refused(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs
) -> None:
    ana, bea = pair
    sent = _challenge(act_as, ana, bea)
    act_as(bea).post("/v1/quiz-sessions", json={"question_count": 1, "reveal_mode": "on_finish"})

    response = act_as(bea).post(f"/v1/challenges/{sent['id']}/accept")

    assert response.status_code == 409
    assert response.json()["code"] == "session_already_open"
    assert act_as(bea).get(f"/v1/challenges/{sent['id']}").json()["status"] == "pending"


def test_cancelling_the_attempt_counts_as_declining(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs
) -> None:
    ana, bea = pair
    sent = _challenge(act_as, ana, bea)
    session = act_as(bea).post(f"/v1/challenges/{sent['id']}/accept").json()

    act_as(bea).post(f"/v1/quiz-sessions/{session['id']}/cancel")

    body = act_as(ana).get(f"/v1/challenges/{sent['id']}").json()
    assert body["status"] == "declined"
    assert body["opponent_score_percent"] is None


def test_declining(pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs) -> None:
    ana, bea = pair
    sent = _challenge(act_as, ana, bea)

    assert act_as(ana).post(f"/v1/challenges/{sent['id']}/decline").status_code == 404
    assert act_as(bea).post(f"/v1/challenges/{sent['id']}/decline").json()["status"] == "declined"
    assert act_as(bea).post(f"/v1/challenges/{sent['id']}/accept").status_code == 409


def test_a_challenge_expires_after_a_week(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs, db_session: Session
) -> None:
    ana, bea = pair
    sent = _challenge(act_as, ana, bea)
    challenge = db_session.get(Challenge, uuid.UUID(sent["id"]))
    assert challenge is not None
    challenge.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()

    response = act_as(bea).post(f"/v1/challenges/{sent['id']}/accept")

    assert response.status_code == 409
    assert act_as(ana).get(f"/v1/challenges/{sent['id']}").json()["status"] == "expired"


def test_outsiders_cannot_see_a_challenge(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs, make_user: MakeUser
) -> None:
    ana, bea = pair
    sent = _challenge(act_as, ana, bea)
    outsider = make_user("Outsider")

    assert act_as(outsider).get(f"/v1/challenges/{sent['id']}").status_code == 404
    assert act_as(outsider).post(f"/v1/challenges/{sent['id']}/accept").status_code == 404


def test_a_normal_exam_still_starts_and_finishes_as_before(
    pair: tuple[AuthenticatedUser, AuthenticatedUser], act_as: ActAs, db_session: Session
) -> None:
    ana, _ = pair
    session = _take_exam(act_as(ana), ["a", "a", "a"])

    finished = db_session.get(QuizSession, uuid.UUID(session["id"]))
    assert finished is not None
    assert finished.status == "completed"
    assert db_session.scalars(select(Challenge)).all() == []
