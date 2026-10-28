import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.books.models import Book
from app.chapters.models import Chapter
from app.daily.dependencies import Clock, get_clock
from app.documents.models import Document
from app.main import app
from app.questions.models import Question
from app.quizzes.models import QuizSession
from app.sub_chapters.models import SubChapter
from app.users.models import AccountSettings, Profile
from app.users.service import get_or_create_profile


def test_me_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/me")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_me_creates_profile_on_first_access(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    response = authed_client.get("/v1/me")
    assert response.status_code == 200

    body = response.json()
    assert body["id"] == str(authenticated_user.id)
    assert body["email"] == authenticated_user.email
    assert body["display_name"] is None
    assert body["university"] is None
    assert body["settings"] == {
        "theme": "system",
        "notifications_enabled": True,
        "language": "en",
    }

    assert db_session.get(Profile, authenticated_user.id) is not None


def test_delete_me_requires_auth(client: TestClient) -> None:
    response = client.delete("/v1/me")
    assert response.status_code == 401


def test_delete_me_calls_delete_auth_user(
    authed_client: TestClient, authenticated_user: AuthenticatedUser
) -> None:
    with patch("app.users.router.delete_auth_user") as mock_delete_auth_user:
        response = authed_client.delete("/v1/me")

    assert response.status_code == 204
    mock_delete_auth_user.assert_called_once_with(authenticated_user.id)


def test_me_patch_updates_display_name(authed_client: TestClient) -> None:
    authed_client.get("/v1/me")

    response = authed_client.patch("/v1/me", json={"display_name": "Ada"})
    assert response.status_code == 200
    assert response.json()["display_name"] == "Ada"


def test_me_patch_updates_university(authed_client: TestClient) -> None:
    authed_client.get("/v1/me")

    response = authed_client.patch("/v1/me", json={"university": "MIT"})
    assert response.status_code == 200
    assert response.json()["university"] == "MIT"


def test_me_patch_updates_settings_fields(authed_client: TestClient) -> None:
    authed_client.get("/v1/me")

    response = authed_client.patch(
        "/v1/me",
        json={"theme": "dark", "notifications_enabled": False, "language": "es"},
    )
    assert response.status_code == 200
    assert response.json()["settings"] == {
        "theme": "dark",
        "notifications_enabled": False,
        "language": "es",
    }


# --- /v1/me/stats -------------------------------------------------------------
#
# Every streak test pins the day through `app.dependency_overrides[get_clock]`
# and drives the real GET/POST daily-question flow -- the documented test seam
# from test_daily_questions.py -- rather than inserting
# DailyQuestionAttempt rows by hand, since that flow is also what enforces the
# for_date/question_id foreign key against daily_questions.

TODAY = date(2026, 10, 13)


@pytest.fixture(autouse=True)
def _clear_clock_override() -> Iterator[None]:
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_clock, None)


def _set_clock(day: date) -> None:
    app.dependency_overrides[get_clock] = lambda: Clock(
        now=datetime(day.year, day.month, day.day, 9, 0, tzinfo=UTC), today=day
    )


def _answer_today(client: TestClient) -> None:
    today = client.get("/v1/daily-question").json()
    question_id = today["question"]["id"]
    option_id = today["question"]["options"][0]["id"]
    response = client.post(
        "/v1/daily-question/answer",
        json={"question_id": question_id, "selected_option_ids": [option_id]},
    )
    assert response.status_code == 200, response.text


def _make_question(
    db: Session, created_by: uuid.UUID, *, document_id: uuid.UUID | None = None
) -> Question:
    question = Question(
        external_id=str(uuid.uuid4()),
        document_id=document_id,
        prompt="Prompt?",
        kind="single",
        scoring_scheme="single_4",
        options=[{"id": "a", "text": "Right"}, {"id": "b", "text": "Wrong"}],
        correct_option_ids=["a"],
        rationales={},
        explanation="Because.",
        status="published",
        created_by=created_by,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def _make_chapter(db: Session, created_by: uuid.UUID) -> tuple[Chapter, SubChapter]:
    book = Book(title="Book", created_by=created_by)
    db.add(book)
    db.flush()
    chapter = Chapter(book_id=book.id, title="Chapter", created_by=created_by)
    db.add(chapter)
    db.flush()
    sub_chapter = SubChapter(chapter_id=chapter.id, title="Sub", created_by=created_by)
    db.add(sub_chapter)
    db.commit()
    return chapter, sub_chapter


def _make_lesson(
    db: Session, created_by: uuid.UUID, *, sub_chapter_id: uuid.UUID | None = None
) -> Document:
    document = Document(title="Lesson", created_by=created_by, sub_chapter_id=sub_chapter_id)
    db.add(document)
    db.commit()
    return document


def test_my_stats_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/me/stats")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_my_stats_zero_state_for_new_user(authed_client: TestClient) -> None:
    body = authed_client.get("/v1/me/stats").json()
    assert body == {
        "current_streak_days": 0,
        "longest_streak_days": 0,
        "lessons_completed": 0,
        "lessons_eligible": 0,
        "exams_completed": 0,
        "exam_average_score_percent": None,
        "questions_attempted": 0,
        "questions_answered_lifetime": 0,
        "question_accuracy_percent": None,
    }


def test_my_stats_streak_today_only(
    authed_client: TestClient, db_session: Session, authenticated_user: AuthenticatedUser
) -> None:
    authed_client.get("/v1/me")
    _make_question(db_session, authenticated_user.id)

    _set_clock(TODAY)
    _answer_today(authed_client)

    body = authed_client.get("/v1/me/stats").json()
    assert body["current_streak_days"] == 1
    assert body["longest_streak_days"] == 1


def test_my_stats_streak_three_consecutive_days(
    authed_client: TestClient, db_session: Session, authenticated_user: AuthenticatedUser
) -> None:
    authed_client.get("/v1/me")
    _make_question(db_session, authenticated_user.id)

    for offset in (2, 1, 0):
        _set_clock(TODAY - timedelta(days=offset))
        _answer_today(authed_client)
    _set_clock(TODAY)

    body = authed_client.get("/v1/me/stats").json()
    assert body["current_streak_days"] == 3
    assert body["longest_streak_days"] == 3


def test_my_stats_streak_alive_before_todays_answer(
    authed_client: TestClient, db_session: Session, authenticated_user: AuthenticatedUser
) -> None:
    authed_client.get("/v1/me")
    _make_question(db_session, authenticated_user.id)

    _set_clock(TODAY - timedelta(days=1))
    _answer_today(authed_client)
    _set_clock(TODAY)  # today unanswered -- the streak must not reset yet

    body = authed_client.get("/v1/me/stats").json()
    assert body["current_streak_days"] == 1
    assert body["longest_streak_days"] == 1


def test_my_stats_gap_breaks_current_but_not_longest(
    authed_client: TestClient, db_session: Session, authenticated_user: AuthenticatedUser
) -> None:
    authed_client.get("/v1/me")
    _make_question(db_session, authenticated_user.id)

    for offset in (4, 3, 2):
        _set_clock(TODAY - timedelta(days=offset))
        _answer_today(authed_client)
    # offset 1 (yesterday) is deliberately skipped -- the gap.
    _set_clock(TODAY)
    _answer_today(authed_client)

    body = authed_client.get("/v1/me/stats").json()
    assert body["current_streak_days"] == 1
    assert body["longest_streak_days"] == 3


def test_my_stats_lesson_completion_matches_bank_tree_rollup(
    authed_client: TestClient, db_session: Session, authenticated_user: AuthenticatedUser
) -> None:
    authed_client.get("/v1/me")
    _, sub_chapter = _make_chapter(db_session, authenticated_user.id)
    completed_lesson = _make_lesson(
        db_session, authenticated_user.id, sub_chapter_id=sub_chapter.id
    )
    incomplete_lesson = _make_lesson(
        db_session, authenticated_user.id, sub_chapter_id=sub_chapter.id
    )
    good_question = _make_question(
        db_session, authenticated_user.id, document_id=completed_lesson.id
    )
    bad_question = _make_question(
        db_session, authenticated_user.id, document_id=incomplete_lesson.id
    )

    authed_client.post(
        f"/v1/question-bank/{good_question.id}/answers", json={"selected_option_ids": ["a"]}
    )
    authed_client.post(
        f"/v1/question-bank/{bad_question.id}/answers", json={"selected_option_ids": ["b"]}
    )

    tree = authed_client.get("/v1/question-bank/tree").json()
    stats = authed_client.get("/v1/me/stats").json()

    # Pins the shared `_is_lesson_completed` helper: the profile total and the
    # Library's own book-level rollup must agree on what "completed" means.
    assert stats["lessons_completed"] == tree["books"][0]["completed_lesson_count"] == 1
    assert stats["lessons_eligible"] == tree["books"][0]["eligible_lesson_count"] == 2


def test_my_stats_exam_average(
    authed_client: TestClient, db_session: Session, authenticated_user: AuthenticatedUser
) -> None:
    authed_client.get("/v1/me")
    db_session.add_all(
        [
            QuizSession(
                user_id=authenticated_user.id,
                status="completed",
                reveal_mode="on_finish",
                filter_spec={},
                question_count=1,
                points_awarded=8,
                points_possible=10,
            ),
            QuizSession(
                user_id=authenticated_user.id,
                status="completed",
                reveal_mode="on_finish",
                filter_spec={},
                question_count=1,
                points_awarded=2,
                points_possible=10,
            ),
            # An abandoned session: excluded, since it was never graded.
            QuizSession(
                user_id=authenticated_user.id,
                status="expired",
                reveal_mode="on_finish",
                filter_spec={},
                question_count=1,
            ),
        ]
    )
    db_session.commit()

    body = authed_client.get("/v1/me/stats").json()
    assert body["exams_completed"] == 2
    assert body["exam_average_score_percent"] == 50.0


def test_my_stats_question_accuracy(
    authed_client: TestClient, db_session: Session, authenticated_user: AuthenticatedUser
) -> None:
    authed_client.get("/v1/me")
    right = _make_question(db_session, authenticated_user.id)
    wrong = _make_question(db_session, authenticated_user.id)
    authed_client.post(f"/v1/question-bank/{right.id}/answers", json={"selected_option_ids": ["a"]})
    authed_client.post(f"/v1/question-bank/{wrong.id}/answers", json={"selected_option_ids": ["b"]})
    # Re-answering `right` must grow lifetime answers without growing
    # attempted -- QuestionProgress is latest-attempt-wins per question.
    authed_client.post(f"/v1/question-bank/{right.id}/answers", json={"selected_option_ids": ["a"]})

    body = authed_client.get("/v1/me/stats").json()
    assert body["questions_attempted"] == 2
    assert body["questions_answered_lifetime"] == 3
    assert body["question_accuracy_percent"] == 50.0


def test_profile_creation_survives_a_concurrent_insert(
    authenticated_user: AuthenticatedUser, db_session: Session
) -> None:
    # A first sign-in fans out several GET /v1/me at once -- every screen the
    # mobile tab navigator mounts asks for ["me"] -- so two requests can both
    # read "no profile" before either inserts. The loser used to surface as a
    # 500 on profiles_pkey.
    db_session.add(
        Profile(
            id=authenticated_user.id,
            settings=AccountSettings(user_id=authenticated_user.id),
        )
    )
    db_session.commit()
    # Forget the winner's row, so the insert below reaches the database and is
    # refused there rather than by SQLAlchemy's identity map -- an identity
    # clash raises FlushError, which is not what production hits.
    db_session.expunge_all()

    real_get = Session.get
    seen = {"calls": 0}

    def stale_first_read(self: Session, entity: object, ident: object, **kwargs: object) -> object:
        seen["calls"] += 1
        if seen["calls"] == 1:
            return None
        return real_get(self, entity, ident, **kwargs)  # type: ignore[arg-type]

    with patch.object(Session, "get", stale_first_read):
        profile = get_or_create_profile(db_session, authenticated_user)

    # The racing caller gets the winner's row back instead of an exception.
    assert profile.id == authenticated_user.id
    assert db_session.query(Profile).count() == 1
    # And it got there through the IntegrityError branch, not by the insert
    # quietly succeeding: the recovery re-read is the second `get`. Without
    # this the test would still pass if the race never happened.
    assert seen["calls"] == 2
