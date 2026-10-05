import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.books.models import Book
from app.chapters.models import Chapter
from app.documents.models import Document
from app.progress.models import QuestionProgress
from app.questions.models import Question, QuestionTag, Tag
from app.quizzes.models import QuizSession
from app.sub_chapters.models import SubChapter
from app.users.models import AccountSettings, Profile

_AUTHOR_ID = uuid.uuid4()


def _ensure_author(db_session: Session) -> uuid.UUID:
    if db_session.get(Profile, _AUTHOR_ID) is None:
        db_session.add(Profile(id=_AUTHOR_ID, settings=AccountSettings(user_id=_AUTHOR_ID)))
        db_session.commit()
    return _AUTHOR_ID


def _make_chapter(
    db_session: Session, *, sub_chapter_count: int
) -> tuple[Chapter, list[SubChapter]]:
    """A book with one chapter and N sub-chapters. `sub_chapter_count=0`
    gives the empty-chapter case, which must resolve to zero lessons."""
    author = _ensure_author(db_session)
    book = Book(title="Book", created_by=author)
    db_session.add(book)
    db_session.flush()
    chapter = Chapter(book_id=book.id, title="Chapter", created_by=author)
    db_session.add(chapter)
    db_session.flush()
    sub_chapters = [
        SubChapter(chapter_id=chapter.id, title=f"Sub {index}", created_by=author)
        for index in range(sub_chapter_count)
    ]
    db_session.add_all(sub_chapters)
    db_session.commit()
    return chapter, sub_chapters


def _make_lesson(db_session: Session, *, sub_chapter_id: uuid.UUID | None = None) -> Document:
    document = Document(
        title="Lesson", created_by=_ensure_author(db_session), sub_chapter_id=sub_chapter_id
    )
    db_session.add(document)
    db_session.commit()
    return document


def _make_question(
    db_session: Session,
    *,
    prompt: str = "Prompt?",
    kind: str = "single",
    scoring_scheme: str = "single_4",
    status: str = "published",
    document_id: uuid.UUID | None = None,
    tags: list[Tag] | None = None,
) -> Question:
    if kind == "single":
        options = [{"id": "a", "text": "Right"}, {"id": "b", "text": "Wrong"}]
        correct = ["a"]
    else:
        options = [{"id": c, "text": c} for c in "abcde"]
        correct = ["a", "b"]
    question = Question(
        external_id=str(uuid.uuid4()),
        document_id=document_id,
        prompt=prompt,
        kind=kind,
        scoring_scheme=scoring_scheme,
        options=options,
        correct_option_ids=correct,
        rationales={},
        explanation="Because.",
        status=status,
        created_by=_ensure_author(db_session),
    )
    db_session.add(question)
    db_session.flush()
    for tag in tags or []:
        db_session.add(QuestionTag(question_id=question.id, tag_id=tag.id))
    db_session.commit()
    db_session.refresh(question)
    return question


def _start(client: TestClient, **overrides: object) -> dict:
    payload = {"question_count": 1, "duration_seconds": None, "reveal_mode": "on_finish"}
    payload.update(overrides)
    response = client.post("/v1/quiz-sessions", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


# --- start / sampling -------------------------------------------------------


def test_start_session_requires_auth(client: TestClient) -> None:
    assert client.post("/v1/quiz-sessions", json={"question_count": 1}).status_code == 401


def test_start_session_with_no_matching_questions(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/quiz-sessions",
        json={"question_count": 1, "reveal_mode": "on_finish"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "no_questions_match"


def test_start_session_only_draws_published_questions(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session, status="draft")
    response = authed_client.post(
        "/v1/quiz-sessions", json={"question_count": 1, "reveal_mode": "on_finish"}
    )
    assert response.json()["code"] == "no_questions_match"


def test_start_session_filters_by_tag(authed_client: TestClient, db_session: Session) -> None:
    matching_tag = Tag(slug="cardio", label="Cardio")
    other_tag = Tag(slug="renal", label="Renal")
    db_session.add_all([matching_tag, other_tag])
    db_session.flush()
    # Distinct prompts: with both questions sharing one prompt this assertion
    # passes even when the tag filter is doing nothing at all.
    _make_question(db_session, prompt="Renal question", tags=[other_tag])
    _make_question(db_session, prompt="Cardio question", tags=[matching_tag])

    body = _start(authed_client, question_count=10, tag_ids=[str(matching_tag.id)])

    assert [q["prompt"] for q in body["questions"]] == ["Cardio question"]


def test_start_session_draws_a_two_tag_question_only_once(
    authed_client: TestClient, db_session: Session
) -> None:
    # Filtering tags by JOIN instead of subquery returns one row per matching
    # tag, so a question carrying both selected tags gets drawn twice and
    # violates unique(session_id, question_id) at insert (§8.4).
    first = Tag(slug="cardio", label="Cardio")
    second = Tag(slug="pharm", label="Pharmacology")
    db_session.add_all([first, second])
    db_session.flush()
    _make_question(db_session, prompt="Both tags", tags=[first, second])

    body = _start(authed_client, question_count=10, tag_ids=[str(first.id), str(second.id)])

    assert body["question_count"] == 1
    assert [q["prompt"] for q in body["questions"]] == ["Both tags"]


def test_selecting_two_tags_intersects(authed_client: TestClient, db_session: Session) -> None:
    # Tags AND: "treatment" plus "rezidentiat 2022" means questions that are
    # both, not either. (This reverses the older OR behaviour.)
    treatment = Tag(slug="treatment", label="Treatment")
    rezidentiat = Tag(slug="rezidentiat-2022", label="Rezidentiat 2022")
    db_session.add_all([treatment, rezidentiat])
    db_session.flush()
    _make_question(db_session, prompt="Treatment only", tags=[treatment])
    _make_question(db_session, prompt="Rezidentiat only", tags=[rezidentiat])
    _make_question(db_session, prompt="Both tags", tags=[treatment, rezidentiat])

    both = [str(treatment.id), str(rezidentiat.id)]
    count = authed_client.get("/v1/quiz-sessions/available-count", params={"tag_ids": both})
    assert count.json() == {"available": 1}

    body = _start(authed_client, question_count=10, tag_ids=both)
    assert [q["prompt"] for q in body["questions"]] == ["Both tags"]


def test_tags_with_no_question_in_common_match_nothing(
    authed_client: TestClient, db_session: Session
) -> None:
    cardiology = Tag(slug="cardiology", label="Cardiology")
    neurology = Tag(slug="neurology", label="Neurology")
    db_session.add_all([cardiology, neurology])
    db_session.flush()
    _make_question(db_session, prompt="Heart question", tags=[cardiology])
    _make_question(db_session, prompt="Brain question", tags=[neurology])

    both = [str(cardiology.id), str(neurology.id)]
    count = authed_client.get("/v1/quiz-sessions/available-count", params={"tag_ids": both})
    assert count.json() == {"available": 0}

    response = authed_client.post(
        "/v1/quiz-sessions",
        json={"question_count": 10, "reveal_mode": "on_finish", "tag_ids": both},
    )
    assert response.json()["code"] == "no_questions_match"


def test_a_repeated_tag_id_is_harmless(authed_client: TestClient, db_session: Session) -> None:
    # Under a GROUP BY / HAVING COUNT(DISTINCT) formulation a duplicated tag
    # silently matches nothing; with one EXISTS per tag it is merely a
    # redundant predicate.
    treatment = Tag(slug="treatment", label="Treatment")
    db_session.add(treatment)
    db_session.flush()
    _make_question(db_session, prompt="Treatment question", tags=[treatment])

    twice = [str(treatment.id), str(treatment.id)]
    count = authed_client.get("/v1/quiz-sessions/available-count", params={"tag_ids": twice})
    assert count.json() == {"available": 1}


def test_selecting_a_chapter_unions_every_lesson_beneath_it(
    authed_client: TestClient, db_session: Session
) -> None:
    # Topics OR: a chapter pulls in the lessons of all of its sub-chapters.
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=2)
    first = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    second = _make_lesson(db_session, sub_chapter_id=sub_chapters[1].id)
    _make_question(db_session, prompt="First lesson", document_id=first.id)
    _make_question(db_session, prompt="Second lesson", document_id=second.id)
    _make_question(db_session, prompt="Unrelated")

    count = authed_client.get(
        "/v1/quiz-sessions/available-count", params={"chapter_ids": [str(chapter.id)]}
    )
    assert count.json() == {"available": 2}

    body = _start(authed_client, question_count=10, chapter_ids=[str(chapter.id)])
    assert sorted(q["prompt"] for q in body["questions"]) == ["First lesson", "Second lesson"]


def test_a_lesson_is_reachable_from_every_level_above_it(
    authed_client: TestClient, db_session: Session
) -> None:
    # A question binds to a lesson and only a lesson (questions.document_id).
    # It has no sub_chapter_id or chapter_id of its own — it becomes reachable
    # from those levels because the server expands them down to lessons.
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=1)
    lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    _make_question(db_session, prompt="Only question", document_id=lesson.id)

    for params in (
        {"chapter_ids": [str(chapter.id)]},
        {"sub_chapter_ids": [str(sub_chapters[0].id)]},
        {"document_ids": [str(lesson.id)]},
    ):
        count = authed_client.get("/v1/quiz-sessions/available-count", params=params)
        assert count.json() == {"available": 1}, params


def test_overlapping_topic_levels_do_not_double_count(
    authed_client: TestClient, db_session: Session
) -> None:
    # Selecting a chapter AND a lesson inside it describes the same question
    # twice. resolve_topic_documents unions into a set, so it is drawn once —
    # otherwise unique(session_id, question_id) would blow up at insert.
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=1)
    lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    _make_question(db_session, prompt="Counted once", document_id=lesson.id)

    both = {"chapter_ids": [str(chapter.id)], "document_ids": [str(lesson.id)]}
    count = authed_client.get("/v1/quiz-sessions/available-count", params=both)
    assert count.json() == {"available": 1}

    body = _start(
        authed_client,
        question_count=10,
        chapter_ids=[str(chapter.id)],
        document_ids=[str(lesson.id)],
    )
    assert body["question_count"] == 1
    assert [q["prompt"] for q in body["questions"]] == ["Counted once"]


def test_an_empty_chapter_matches_nothing_rather_than_everything(
    authed_client: TestClient, db_session: Session
) -> None:
    # The resolved lesson list is empty, which must mean "no questions" — not
    # "no filter". Treating [] as absent would hand over the entire bank.
    chapter, _ = _make_chapter(db_session, sub_chapter_count=0)
    _make_question(db_session, prompt="Some other question")

    count = authed_client.get(
        "/v1/quiz-sessions/available-count", params={"chapter_ids": [str(chapter.id)]}
    )
    assert count.json() == {"available": 0}

    response = authed_client.post(
        "/v1/quiz-sessions",
        json={"question_count": 10, "reveal_mode": "on_finish", "chapter_ids": [str(chapter.id)]},
    )
    assert response.json()["code"] == "no_questions_match"


def test_topic_and_tag_axes_and_together(authed_client: TestClient, db_session: Session) -> None:
    # The worked example: topics {cardio, pharma} unioned, then narrowed to
    # those also carrying "treatment".
    treatment = Tag(slug="treatment", label="Treatment")
    db_session.add(treatment)
    db_session.flush()
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=2)
    cardio = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    pharma = _make_lesson(db_session, sub_chapter_id=sub_chapters[1].id)
    _make_question(db_session, prompt="Cardio treatment", document_id=cardio.id, tags=[treatment])
    _make_question(db_session, prompt="Pharma treatment", document_id=pharma.id, tags=[treatment])
    _make_question(db_session, prompt="Cardio diagnosis", document_id=cardio.id)
    _make_question(db_session, prompt="Elsewhere treatment", tags=[treatment])

    body = _start(
        authed_client,
        question_count=10,
        chapter_ids=[str(chapter.id)],
        tag_ids=[str(treatment.id)],
    )

    assert sorted(q["prompt"] for q in body["questions"]) == [
        "Cardio treatment",
        "Pharma treatment",
    ]


def test_start_session_pool_smaller_than_requested(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    body = _start(authed_client, question_count=5)
    assert body["question_count"] == 1
    assert len(body["questions"]) == 1


def test_only_one_open_session_per_user(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    _make_question(db_session)
    _start(authed_client)

    response = authed_client.post(
        "/v1/quiz-sessions", json={"question_count": 1, "reveal_mode": "on_finish"}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "session_already_open"


def test_a_new_session_can_start_once_the_previous_one_finished(
    authed_client: TestClient, db_session: Session
) -> None:
    # The one-open-session index must be PARTIAL. A plain unique index on
    # user_id passes test_only_one_open_session_per_user just as well, then
    # blocks every future quiz that user ever starts.
    _make_question(db_session)
    first = _start(authed_client)
    authed_client.post(f"/v1/quiz-sessions/{first['id']}/submit")

    second = _start(authed_client)

    assert second["id"] != first["id"]


def test_starting_is_allowed_once_a_stale_session_has_expired(
    authed_client: TestClient, db_session: Session
) -> None:
    # Start is a write, and lazy expiry runs on every touch (§6.1): an open
    # session whose deadline has already passed must not block a new one
    # just because nobody happened to read it first.
    _make_question(db_session)
    stale = _start(authed_client, duration_seconds=60)
    stored = db_session.get(QuizSession, uuid.UUID(stale["id"]))
    assert stored is not None
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()

    started = _start(authed_client)

    assert started["id"] != stale["id"]
    db_session.refresh(stored)
    assert stored.status == "expired"


def test_out_of_range_bounds_are_invalid_request(
    authed_client: TestClient, db_session: Session
) -> None:
    # §7.2/§7.4 pin this as 400 invalid_request with the offending field in
    # details — not Pydantic's automatic 422 validation_error, which the
    # frontend branches on differently.
    _make_question(db_session)

    too_many = authed_client.post(
        "/v1/quiz-sessions",
        json={"question_count": 101, "reveal_mode": "on_finish"},
    )
    assert too_many.status_code == 400
    assert too_many.json()["code"] == "invalid_request"
    assert [d["field"] for d in too_many.json()["details"]] == ["question_count"]

    too_short = authed_client.post(
        "/v1/quiz-sessions",
        json={"question_count": 1, "duration_seconds": 30, "reveal_mode": "on_finish"},
    )
    assert too_short.status_code == 400
    assert too_short.json()["code"] == "invalid_request"
    assert [d["field"] for d in too_short.json()["details"]] == ["duration_seconds"]


def test_options_never_carry_the_answer_key(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    body = _start(authed_client)
    assert body["questions"][0]["options"] == [
        {"id": "a", "text": "Right"},
        {"id": "b", "text": "Wrong"},
    ]
    assert "correct_option_ids" not in body["questions"][0]


# --- current / ownership -----------------------------------------------------


def test_current_session_is_null_when_none_open(authed_client: TestClient) -> None:
    response = authed_client.get("/v1/quiz-sessions/current")
    assert response.status_code == 200
    assert response.json() is None


def test_current_session_returns_the_open_one(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    started = _start(authed_client)
    current = authed_client.get("/v1/quiz-sessions/current").json()
    assert current["id"] == started["id"]


def test_session_not_found_for_another_user_is_404_not_403(
    client: TestClient, db_session: Session
) -> None:
    from app.auth.dependencies import get_current_user
    from app.auth.schemas import AuthenticatedUser
    from app.main import app

    _make_question(db_session)
    user_a = AuthenticatedUser(id=uuid.uuid4(), email="a@example.com")
    app.dependency_overrides[get_current_user] = lambda: user_a
    started = _start(client)
    app.dependency_overrides.pop(get_current_user, None)

    user_b = AuthenticatedUser(id=uuid.uuid4(), email="b@example.com")
    app.dependency_overrides[get_current_user] = lambda: user_b
    try:
        response = client.get(f"/v1/quiz-sessions/{started['id']}")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 404


# --- answering: on_finish ----------------------------------------------------


def test_on_finish_answers_are_editable_and_hide_the_key(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish")
    session_id = session["id"]

    response = authed_client.put(
        f"/v1/quiz-sessions/{session_id}/answers/0", json={"selected_option_ids": ["b"]}
    )
    assert response.status_code == 200
    assert response.json() == {"saved": True}

    # Freely editable before submit.
    response = authed_client.put(
        f"/v1/quiz-sessions/{session_id}/answers/0", json={"selected_option_ids": ["a"]}
    )
    assert response.json() == {"saved": True}

    detail = authed_client.get(f"/v1/quiz-sessions/{session_id}").json()
    assert detail["questions"][0]["points_awarded"] is None
    assert detail["questions"][0]["outcome"] is None


def test_submit_grades_on_finish_answers(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish")
    session_id = session["id"]
    authed_client.put(
        f"/v1/quiz-sessions/{session_id}/answers/0", json={"selected_option_ids": ["a"]}
    )

    response = authed_client.post(f"/v1/quiz-sessions/{session_id}/submit")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["points_awarded"] == 4
    assert body["points_possible"] == 4


def test_submit_scores_unanswered_questions_zero(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish")
    response = authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit")
    body = response.json()
    assert body["points_awarded"] == 0
    assert body["points_possible"] == 4


# --- answering: immediate ----------------------------------------------------


def test_immediate_reveals_and_locks_the_answer(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="immediate")
    session_id = session["id"]

    response = authed_client.put(
        f"/v1/quiz-sessions/{session_id}/answers/0", json={"selected_option_ids": ["a"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["points_awarded"] == 4
    assert body["outcome"] == "correct"
    option_a = next(o for o in body["options"] if o["id"] == "a")
    assert option_a == {
        "id": "a",
        "text": "Right",
        "in_key": True,
        "selected": True,
        "classified_correctly": True,
        "rationale": None,
    }

    again = authed_client.put(
        f"/v1/quiz-sessions/{session_id}/answers/0", json={"selected_option_ids": ["b"]}
    )
    assert again.status_code == 409
    assert again.json()["code"] == "already_answered"


def test_immediate_rejects_empty_answer(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="immediate")
    response = authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": []}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_selection"


def test_invalid_option_id_is_rejected(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish")
    response = authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["z"]}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_selection"


def test_multi_select_on_single_kind_is_rejected(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish")
    response = authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["a", "b"]}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_selection"


def test_multi_5_per_option_scoring(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session, kind="multi", scoring_scheme="multi_5_per_option")
    session = _start(authed_client, reveal_mode="immediate")
    response = authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0",
        json={"selected_option_ids": ["a", "b", "c"]},
    )
    body = response.json()
    # key is {a, b}; c wrongly selected -> 4/5, outcome partial.
    assert body["points_awarded"] == 4
    assert body["outcome"] == "partial"


# --- pause / resume -----------------------------------------------------------


def test_pause_then_resume_preserves_remaining_time(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish", duration_seconds=1800)
    session_id = session["id"]

    paused = authed_client.post(f"/v1/quiz-sessions/{session_id}/pause")
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"

    resumed = authed_client.post(f"/v1/quiz-sessions/{session_id}/resume")
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "active"
    assert resumed.json()["remaining_seconds"] <= 1800


def test_pause_when_not_active_is_invalid_state(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    session = _start(authed_client)
    authed_client.post(f"/v1/quiz-sessions/{session['id']}/pause")
    response = authed_client.post(f"/v1/quiz-sessions/{session['id']}/pause")
    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


def test_answering_while_paused_is_rejected(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    session = _start(authed_client)
    authed_client.post(f"/v1/quiz-sessions/{session['id']}/pause")
    response = authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["a"]}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


# --- cancel / submit / results -----------------------------------------------


def test_cancel_is_terminal_and_ungraded(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    session = _start(authed_client)
    response = authed_client.post(f"/v1/quiz-sessions/{session['id']}/cancel")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["points_awarded"] is None
    assert body["points_possible"] is None


def test_results_are_gated_until_terminal(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    session = _start(authed_client)
    response = authed_client.get(f"/v1/quiz-sessions/{session['id']}/results")
    assert response.status_code == 409
    assert response.json()["code"] == "results_not_ready"

    authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit")
    response = authed_client.get(f"/v1/quiz-sessions/{session['id']}/results")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_results_carry_both_scoring_axes(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session, kind="multi", scoring_scheme="multi_5_per_option")
    session = _start(authed_client, reveal_mode="on_finish")
    authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0",
        json={"selected_option_ids": ["a", "c"]},
    )
    authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit")
    results = authed_client.get(f"/v1/quiz-sessions/{session['id']}/results").json()
    option_c = next(o for o in results["questions"][0]["options"] if o["id"] == "c")
    # c is not in the key (in_key False) but was wrongly selected -> the
    # student did NOT correctly avoid it -> classified_correctly False.
    assert option_c["in_key"] is False
    assert option_c["selected"] is True
    assert option_c["classified_correctly"] is False


def test_finished_session_appears_in_history(
    authed_client: TestClient, db_session: Session
) -> None:
    _make_question(db_session)
    session = _start(authed_client)
    assert authed_client.get("/v1/quiz-sessions").json() == []
    authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit")
    history = authed_client.get("/v1/quiz-sessions").json()
    assert len(history) == 1
    assert history[0]["id"] == session["id"]
    assert "questions" not in history[0]


# --- lazy expiry --------------------------------------------------------------


def test_lazy_expiry_on_read(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    session = _start(authed_client, duration_seconds=60)

    stored = db_session.get(QuizSession, uuid.UUID(session["id"]))
    assert stored is not None
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()

    detail = authed_client.get(f"/v1/quiz-sessions/{session['id']}").json()
    assert detail["status"] == "expired"
    assert detail["points_awarded"] == 0

    assert authed_client.get("/v1/quiz-sessions/current").json() is None


# --- available-count -----------------------------------------------------------


def test_available_count(authed_client: TestClient, db_session: Session) -> None:
    _make_question(db_session)
    _make_question(db_session, status="draft")
    response = authed_client.get("/v1/quiz-sessions/available-count")
    assert response.status_code == 200
    assert response.json() == {"available": 1}


def test_available_count_filters_by_repeated_tag_params(
    authed_client: TestClient, db_session: Session
) -> None:
    # The filters arrive as repeated query params (?tag_ids=..&tag_ids=..),
    # a different binding path from the JSON body the start endpoint takes.
    tag = Tag(slug="cardio", label="Cardio")
    db_session.add(tag)
    db_session.flush()
    _make_question(db_session, tags=[tag])
    _make_question(db_session)

    response = authed_client.get(
        "/v1/quiz-sessions/available-count", params={"tag_ids": [str(tag.id)]}
    )

    assert response.status_code == 200
    assert response.json() == {"available": 1}


# --- progress ---------------------------------------------------------------


def _progress(db_session: Session, question_id: uuid.UUID) -> QuestionProgress | None:
    return db_session.scalars(
        select(QuestionProgress).where(QuestionProgress.question_id == question_id)
    ).one_or_none()


def test_answering_records_progress(authed_client: TestClient, db_session: Session) -> None:
    question = _make_question(db_session)
    session = _start(authed_client, reveal_mode="immediate")
    authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["a"]}
    )

    row = _progress(db_session, question.id)
    assert row is not None
    assert row.outcome == "correct"
    assert row.points_awarded == 4
    assert row.attempt_count == 1


def test_submitting_records_progress_for_on_finish_answers(
    authed_client: TestClient, db_session: Session
) -> None:
    question = _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish")
    authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["b"]}
    )
    assert _progress(db_session, question.id) is None  # not graded until submit

    authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit")

    row = _progress(db_session, question.id)
    assert row is not None
    assert row.outcome == "incorrect"


def test_unanswered_questions_write_no_progress(
    authed_client: TestClient, db_session: Session
) -> None:
    # "40/200 completed" must mean 40 genuinely attempted, not 40 displayed —
    # a student who times out with questions unseen should not find them
    # marked incorrect on their topic dashboard (§5.5).
    question = _make_question(db_session)
    session = _start(authed_client, reveal_mode="on_finish")

    body = authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit").json()

    assert body["points_awarded"] == 0  # still scored 0 within the session
    assert _progress(db_session, question.id) is None  # but never attempted


def test_immediate_answers_are_not_double_counted_at_submit(
    authed_client: TestClient, db_session: Session
) -> None:
    # _finalize skips rows already graded, so an immediate session must not
    # bump attempt_count a second time when it is submitted.
    question = _make_question(db_session)
    session = _start(authed_client, reveal_mode="immediate")
    authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["a"]}
    )
    authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit")

    row = _progress(db_session, question.id)
    assert row is not None
    assert row.attempt_count == 1


# --- the bank tree -----------------------------------------------------------


def test_bank_tree_counts_roll_up_and_track_answers(
    authed_client: TestClient, db_session: Session
) -> None:
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=1)
    lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    first = _make_question(db_session, prompt="One", document_id=lesson.id)
    _make_question(db_session, prompt="Two", document_id=lesson.id)

    tree = authed_client.get("/v1/question-bank/tree").json()
    book = tree["books"][0]
    lesson_node = book["chapters"][0]["sub_chapters"][0]["lessons"][0]
    assert lesson_node["question_count"] == 2
    assert lesson_node["answered_count"] == 0
    # Totals sum upward through sub-chapter, chapter and book.
    assert book["chapters"][0]["question_count"] == 2
    assert book["question_count"] == 2
    assert book["chapters"][0]["id"] == str(chapter.id)

    authed_client.post(f"/v1/question-bank/{first.id}/answers", json={"selected_option_ids": ["a"]})

    tree = authed_client.get("/v1/question-bank/tree").json()
    assert tree["books"][0]["answered_count"] == 1


def test_bank_tree_outcome_and_points_roll_up(
    authed_client: TestClient, db_session: Session
) -> None:
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=1)
    lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    right = _make_question(db_session, prompt="Right one", document_id=lesson.id)
    wrong = _make_question(db_session, prompt="Wrong one", document_id=lesson.id)
    _make_question(db_session, prompt="Never answered", document_id=lesson.id)

    authed_client.post(f"/v1/question-bank/{right.id}/answers", json={"selected_option_ids": ["a"]})
    authed_client.post(f"/v1/question-bank/{wrong.id}/answers", json={"selected_option_ids": ["b"]})

    tree = authed_client.get("/v1/question-bank/tree").json()
    book = tree["books"][0]
    lesson_node = book["chapters"][0]["sub_chapters"][0]["lessons"][0]

    assert lesson_node["question_count"] == 3
    assert lesson_node["answered_count"] == 2
    assert lesson_node["correct_count"] == 1
    assert lesson_node["partial_count"] == 0
    assert lesson_node["incorrect_count"] == 1
    assert lesson_node["points_awarded"] == 4
    assert lesson_node["points_possible"] == 8

    # The breakdown rolls up through sub-chapter, chapter and book exactly
    # like question_count/answered_count already do.
    for node in (
        book["chapters"][0]["sub_chapters"][0],
        book["chapters"][0],
        book,
    ):
        assert node["correct_count"] == 1
        assert node["incorrect_count"] == 1
        assert node["points_awarded"] == 4
        assert node["points_possible"] == 8


def test_bank_tree_lesson_completion_threshold(
    authed_client: TestClient, db_session: Session
) -> None:
    # Five questions so 4/5 = 0.80 lands exactly on the threshold (>=), and
    # 3/4 = 0.75 lands just under it — the two cases that actually exercise
    # the boundary rather than an obviously-above/obviously-below score.
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=1)
    lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    questions = [_make_question(db_session, document_id=lesson.id) for _ in range(5)]

    for question in questions[:3]:
        authed_client.post(
            f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": ["a"]}
        )
    authed_client.post(
        f"/v1/question-bank/{questions[3].id}/answers", json={"selected_option_ids": ["b"]}
    )

    tree = authed_client.get("/v1/question-bank/tree").json()
    lesson_node = tree["books"][0]["chapters"][0]["sub_chapters"][0]["lessons"][0]
    assert lesson_node["answered_count"] == 4
    assert lesson_node["correct_count"] == 3
    assert lesson_node["eligible_lesson_count"] == 1
    # 3/4 = 0.75, just under the 0.8 threshold.
    assert lesson_node["completed_lesson_count"] == 0

    authed_client.post(
        f"/v1/question-bank/{questions[4].id}/answers", json={"selected_option_ids": ["a"]}
    )

    tree = authed_client.get("/v1/question-bank/tree").json()
    lesson_node = tree["books"][0]["chapters"][0]["sub_chapters"][0]["lessons"][0]
    # 4/5 = 0.80, exactly the threshold — ">=" must count this as completed.
    assert lesson_node["answered_count"] == 5
    assert lesson_node["correct_count"] == 4
    assert lesson_node["completed_lesson_count"] == 1


def test_bank_tree_lesson_with_no_questions_is_not_eligible(
    authed_client: TestClient, db_session: Session
) -> None:
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=1)
    empty_lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    answered_lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    question = _make_question(db_session, document_id=answered_lesson.id)
    authed_client.post(
        f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": ["a"]}
    )

    tree = authed_client.get("/v1/question-bank/tree").json()
    lessons = {
        node["id"]: node for node in tree["books"][0]["chapters"][0]["sub_chapters"][0]["lessons"]
    }
    assert lessons[str(empty_lesson.id)]["eligible_lesson_count"] == 0
    assert lessons[str(empty_lesson.id)]["completed_lesson_count"] == 0
    assert lessons[str(answered_lesson.id)]["eligible_lesson_count"] == 1
    assert lessons[str(answered_lesson.id)]["completed_lesson_count"] == 1

    # The lesson with no questions is excluded from both the numerator and
    # the denominator at every ancestor — a sub-chapter with one completed,
    # eligible lesson and one ineligible one rolls up to 1/1, not 1/2.
    sub_chapter_node = tree["books"][0]["chapters"][0]["sub_chapters"][0]
    for node in (sub_chapter_node, tree["books"][0]["chapters"][0], tree["books"][0]):
        assert node["eligible_lesson_count"] == 1
        assert node["completed_lesson_count"] == 1


def test_bank_tree_completed_lesson_count_rolls_up_across_sub_chapters(
    authed_client: TestClient, db_session: Session
) -> None:
    chapter, sub_chapters = _make_chapter(db_session, sub_chapter_count=2)
    completed_lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[0].id)
    incomplete_lesson = _make_lesson(db_session, sub_chapter_id=sub_chapters[1].id)
    good_question = _make_question(db_session, document_id=completed_lesson.id)
    bad_question = _make_question(db_session, document_id=incomplete_lesson.id)
    authed_client.post(
        f"/v1/question-bank/{good_question.id}/answers", json={"selected_option_ids": ["a"]}
    )
    authed_client.post(
        f"/v1/question-bank/{bad_question.id}/answers", json={"selected_option_ids": ["b"]}
    )

    tree = authed_client.get("/v1/question-bank/tree").json()
    book = tree["books"][0]

    assert book["chapters"][0]["eligible_lesson_count"] == 2
    assert book["chapters"][0]["completed_lesson_count"] == 1
    assert book["eligible_lesson_count"] == 2
    assert book["completed_lesson_count"] == 1


def test_bank_tree_quiz_session_answer_counts_toward_completion(
    authed_client: TestClient, db_session: Session
) -> None:
    # The same completion rollup regardless of whether an answer came from a
    # quiz session (submitted + graded) or straight from the bank — both
    # paths write `question_progress` through the same `grade_and_record`.
    lesson = _make_lesson(db_session)
    _make_question(db_session, document_id=lesson.id)

    session = authed_client.post(
        "/v1/quiz-sessions",
        json={
            "document_ids": [str(lesson.id)],
            "question_count": 1,
            "duration_seconds": None,
            "reveal_mode": "on_finish",
        },
    ).json()
    authed_client.put(
        f"/v1/quiz-sessions/{session['id']}/answers/0", json={"selected_option_ids": ["a"]}
    )
    authed_client.post(f"/v1/quiz-sessions/{session['id']}/submit")

    tree = authed_client.get("/v1/question-bank/tree").json()
    lesson_node = tree["uncategorized_lessons"][0]
    assert lesson_node["eligible_lesson_count"] == 1
    assert lesson_node["completed_lesson_count"] == 1


def test_bank_tree_unassigned_outcome_and_points(
    authed_client: TestClient, db_session: Session
) -> None:
    question = _make_question(db_session, prompt="Belongs to no lesson")
    authed_client.post(
        f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": ["a"]}
    )

    tree = authed_client.get("/v1/question-bank/tree").json()

    assert tree["unassigned_question_count"] == 1
    assert tree["unassigned_answered_count"] == 1
    assert tree["unassigned_correct_count"] == 1
    assert tree["unassigned_partial_count"] == 0
    assert tree["unassigned_incorrect_count"] == 0
    assert tree["unassigned_points_awarded"] == 4
    assert tree["unassigned_points_possible"] == 4


def test_bank_tree_lists_lessons_with_no_sub_chapter_separately(
    authed_client: TestClient, db_session: Session
) -> None:
    lesson = _make_lesson(db_session)  # no sub_chapter_id — the Uncategorized bucket
    _make_question(db_session, document_id=lesson.id)

    tree = authed_client.get("/v1/question-bank/tree").json()

    assert [node["id"] for node in tree["uncategorized_lessons"]] == [str(lesson.id)]
    assert tree["uncategorized_lessons"][0]["question_count"] == 1


def test_bank_tree_progress_is_per_user(client: TestClient, db_session: Session) -> None:
    from app.auth.dependencies import get_current_user
    from app.auth.schemas import AuthenticatedUser
    from app.main import app

    lesson = _make_lesson(db_session)
    question = _make_question(db_session, document_id=lesson.id)

    answerer = AuthenticatedUser(id=uuid.uuid4(), email="answerer@example.com")
    app.dependency_overrides[get_current_user] = lambda: answerer
    client.post(f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": ["a"]})
    assert (
        client.get("/v1/question-bank/tree").json()["uncategorized_lessons"][0]["answered_count"]
        == 1
    )

    other = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other
    try:
        tree = client.get("/v1/question-bank/tree").json()
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert tree["uncategorized_lessons"][0]["question_count"] == 1
    assert tree["uncategorized_lessons"][0]["answered_count"] == 0


def test_bank_tree_surfaces_questions_attached_to_no_lesson(
    authed_client: TestClient, db_session: Session
) -> None:
    # document_id is nullable (provenance, SET NULL), so a question can
    # belong to no lesson at all — the whole sample import is like this.
    # Those questions sit under no tree node, so without an explicit bucket
    # they are simply unreachable from the Question Bank.
    _make_question(db_session, prompt="Belongs to no lesson")

    tree = authed_client.get("/v1/question-bank/tree").json()

    assert tree["unassigned_question_count"] == 1
    assert tree["unassigned_answered_count"] == 0


def test_bank_browse_can_list_unassigned_questions(
    authed_client: TestClient, db_session: Session
) -> None:
    lesson = _make_lesson(db_session)
    _make_question(db_session, prompt="On a lesson", document_id=lesson.id)
    _make_question(db_session, prompt="Belongs to no lesson")

    body = authed_client.get("/v1/question-bank", params={"unassigned": "true"}).json()

    assert [item["prompt"] for item in body] == ["Belongs to no lesson"]


def test_too_many_tags_is_rejected(authed_client: TestClient, db_session: Session) -> None:
    # Each tag becomes its own EXISTS predicate, so the count has to be
    # bounded rather than however many ids a caller cares to send.
    tags = [Tag(slug=f"tag-{index}", label=f"Tag {index}") for index in range(25)]
    db_session.add_all(tags)
    db_session.commit()

    response = authed_client.get(
        "/v1/quiz-sessions/available-count", params={"tag_ids": [str(tag.id) for tag in tags]}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"


# --- answering from the bank -------------------------------------------------


def test_bank_answer_reveals_and_records(authed_client: TestClient, db_session: Session) -> None:
    question = _make_question(db_session)

    response = authed_client.post(
        f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": ["a"]}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "correct"
    assert body["points_awarded"] == 4
    assert "position" not in body  # no session, so no position
    option_a = next(o for o in body["options"] if o["id"] == "a")
    assert option_a["in_key"] is True and option_a["classified_correctly"] is True

    row = _progress(db_session, question.id)
    assert row is not None and row.attempt_count == 1


def test_bank_answers_are_repeatable(authed_client: TestClient, db_session: Session) -> None:
    # Unlike an immediate session answer, the bank is study: re-answering is
    # allowed and each attempt counts.
    question = _make_question(db_session)
    path = f"/v1/question-bank/{question.id}/answers"

    assert authed_client.post(path, json={"selected_option_ids": ["b"]}).status_code == 200
    second = authed_client.post(path, json={"selected_option_ids": ["a"]})

    assert second.status_code == 200
    row = _progress(db_session, question.id)
    assert row is not None
    assert row.attempt_count == 2
    assert row.outcome == "correct"  # latest attempt wins


def test_bank_answer_404s_for_an_unpublished_question(
    authed_client: TestClient, db_session: Session
) -> None:
    # A draft question must not hand back its answer key.
    question = _make_question(db_session, status="draft")

    response = authed_client.post(
        f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": ["a"]}
    )

    assert response.status_code == 404
    assert _progress(db_session, question.id) is None


def test_bank_answer_rejects_an_empty_selection(
    authed_client: TestClient, db_session: Session
) -> None:
    question = _make_question(db_session)
    response = authed_client.post(
        f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": []}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_selection"


def test_bank_browse_marks_questions_already_answered(
    authed_client: TestClient, db_session: Session
) -> None:
    # Both browse surfaces need to show a tick on what has been answered
    # without a request per question, so the list payload carries progress.
    answered = _make_question(db_session, prompt="Answered")
    _make_question(db_session, prompt="Untouched")

    authed_client.post(
        f"/v1/question-bank/{answered.id}/answers", json={"selected_option_ids": ["a"]}
    )
    by_prompt = {item["prompt"]: item for item in authed_client.get("/v1/question-bank").json()}

    assert by_prompt["Answered"]["progress"]["outcome"] == "correct"
    assert by_prompt["Answered"]["progress"]["attempt_count"] == 1
    assert by_prompt["Answered"]["progress"]["points_awarded"] == 4
    # Never attempted must be null, not a zero-scored row: "not tried" and
    # "tried and scored nothing" render differently.
    assert by_prompt["Untouched"]["progress"] is None


def test_bank_browse_progress_reflects_the_latest_attempt(
    authed_client: TestClient, db_session: Session
) -> None:
    question = _make_question(db_session)
    path = f"/v1/question-bank/{question.id}/answers"

    authed_client.post(path, json={"selected_option_ids": ["b"]})
    first = authed_client.get("/v1/question-bank").json()[0]["progress"]
    assert first["outcome"] == "incorrect" and first["attempt_count"] == 1

    authed_client.post(path, json={"selected_option_ids": ["a"]})
    second = authed_client.get("/v1/question-bank").json()[0]["progress"]

    assert second["outcome"] == "correct"
    assert second["attempt_count"] == 2


def test_bank_browse_progress_is_per_user(client: TestClient, db_session: Session) -> None:
    # The marker must never leak one student's history to another.
    from app.auth.dependencies import get_current_user
    from app.auth.schemas import AuthenticatedUser
    from app.main import app

    question = _make_question(db_session)

    answerer = AuthenticatedUser(id=uuid.uuid4(), email="answerer@example.com")
    app.dependency_overrides[get_current_user] = lambda: answerer
    client.post(f"/v1/question-bank/{question.id}/answers", json={"selected_option_ids": ["a"]})
    assert client.get("/v1/question-bank").json()[0]["progress"] is not None

    other = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other
    try:
        body = client.get("/v1/question-bank").json()
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert body[0]["progress"] is None


# --- sweeper --------------------------------------------------------------------


def test_sweep_expired_finalizes_stale_sessions(
    authed_client: TestClient, db_session: Session
) -> None:
    from app.quizzes.service import sweep_expired

    _make_question(db_session)
    session = _start(authed_client, duration_seconds=None)
    stored = db_session.get(QuizSession, uuid.UUID(session["id"]))
    assert stored is not None
    stored.last_activity_at = datetime.now(UTC) - timedelta(hours=7)
    db_session.commit()

    swept = sweep_expired(db_session)
    assert swept == 1
    db_session.refresh(stored)
    assert stored.status == "expired"
