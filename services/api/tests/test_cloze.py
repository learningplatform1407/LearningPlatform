import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.books.models import Book
from app.chapters.models import Chapter
from app.cloze.models import ClozeCard, ClozeReviewState
from app.documents.models import Document, DocumentVersion
from app.main import app
from app.srs.scheduler import (
    MAX_INTERVAL_DAYS,
    SchedulerState,
    compute_next_state,
    preview_intervals,
)
from app.sub_chapters.models import SubChapter
from app.users.models import AccountSettings, Profile

# --- compute_next_state (pure SM-2 scheduler) ------------------------------


def test_again_resets_repetitions_drops_ease_and_schedules_one_day_out() -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    state = SchedulerState(ease_factor=2.5, interval_days=6, repetitions=2)
    result = compute_next_state("again", state, now=now)
    assert result.repetitions == 0
    assert result.interval_days == 1
    assert result.ease_factor == pytest.approx(2.3)
    assert result.due_at == now + timedelta(days=1)


def test_ease_factor_never_drops_below_the_1_3_floor() -> None:
    result_again = compute_next_state(
        "again", SchedulerState(ease_factor=1.35, interval_days=1, repetitions=1)
    )
    assert result_again.ease_factor == pytest.approx(1.3)

    result_hard = compute_next_state(
        "hard", SchedulerState(ease_factor=1.3, interval_days=1, repetitions=1)
    )
    assert result_hard.ease_factor == pytest.approx(1.3)


def test_good_progression_across_first_second_and_third_reviews() -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    r1 = compute_next_state("good", SchedulerState(2.5, 0, 0), now=now)
    assert (r1.interval_days, r1.repetitions) == (1, 1)

    r2 = compute_next_state(
        "good", SchedulerState(r1.ease_factor, r1.interval_days, r1.repetitions), now=now
    )
    assert (r2.interval_days, r2.repetitions) == (6, 2)

    r3 = compute_next_state(
        "good", SchedulerState(r2.ease_factor, r2.interval_days, r2.repetitions), now=now
    )
    assert r3.interval_days == 15  # round(6 * 2.5)
    assert r3.repetitions == 3
    assert r3.ease_factor == pytest.approx(2.5)  # unchanged by Good


def test_hard_grows_slower_than_good_and_still_lowers_ease() -> None:
    result = compute_next_state(
        "hard", SchedulerState(ease_factor=2.5, interval_days=10, repetitions=3)
    )
    assert result.interval_days == 12  # round(10 * 1.2)
    assert result.ease_factor == pytest.approx(2.35)
    assert result.repetitions == 4


def test_hard_on_a_brand_new_card_gives_a_one_day_interval() -> None:
    result = compute_next_state(
        "hard", SchedulerState(ease_factor=2.5, interval_days=0, repetitions=0)
    )
    assert result.interval_days == 1


def test_easy_applies_the_bonus_and_raises_ease() -> None:
    result = compute_next_state(
        "easy", SchedulerState(ease_factor=2.5, interval_days=6, repetitions=2)
    )
    assert result.interval_days == 20  # round(round(6 * 2.5) * 1.3) = round(19.5) = 20
    assert result.ease_factor == pytest.approx(2.65)
    assert result.repetitions == 3


def test_repeated_easy_grades_cannot_overflow_the_due_date() -> None:
    """Intervals compound by ease, and ease itself grows on `easy`, so this
    reached ~2,500 years by the tenth grade and raised OverflowError on the
    eleventh -- an unhandled 500. Reachable because neither review endpoint
    requires the card to be due, so a client can post repeatedly."""
    state = SchedulerState(ease_factor=2.5, interval_days=0, repetitions=0)
    for _ in range(40):
        result = compute_next_state("easy", state)
        assert result.interval_days <= MAX_INTERVAL_DAYS
        # The point of the cap: computing due_at must never raise.
        assert result.due_at is not None
        state = SchedulerState(result.ease_factor, result.interval_days, result.repetitions)

    assert state.interval_days == MAX_INTERVAL_DAYS


def test_no_rating_can_schedule_a_card_in_the_past_or_today() -> None:
    """The floor of one day is what makes "due" mean "due on a later day".
    It also closes a hole: `good` on repetitions>=2 with interval 0 computed
    round(0 * ease) == 0, which would have left the card permanently due."""
    now = datetime(2026, 1, 1, tzinfo=UTC)
    for interval in (0, 1, 6, 30):
        for reps in (0, 1, 2, 5):
            for rating in ("again", "hard", "good", "easy"):
                result = compute_next_state(rating, SchedulerState(1.3, interval, reps), now=now)
                assert result.interval_days >= 1
                assert result.due_at > now


# --- HTTP endpoints ---------------------------------------------------------


@pytest.fixture
def owner_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="owner@example.com")


def _mark_words(db: Session, document_id: uuid.UUID, text: str, words: list[str]) -> None:
    """Marks each word as a review word, the way an admin's POST would.

    Written straight to the table rather than through the endpoint so the
    learner-facing tests below don't each have to put on an admin hat first;
    the endpoint's own validation has its own tests.
    """
    for word in words:
        start = text.index(word)
        db.add(
            ClozeCard(
                document_id=document_id,
                block_index=0,
                start_offset=start,
                end_offset=start + len(word),
                answer_text=word,
            )
        )
    db.commit()


READY_PARAGRAPH = "The mitochondria produces cellular energy constantly."


@pytest.fixture
def ready_document_id(db_session: Session, owner_user: AuthenticatedUser) -> uuid.UUID:
    """A ready document with one paragraph and two words marked for review
    ("mitochondria", "produces")."""
    db_session.add(Profile(id=owner_user.id, settings=AccountSettings(user_id=owner_user.id)))
    db_session.flush()

    document = Document(title="Test Lecture", created_by=owner_user.id)
    db_session.add(document)
    db_session.flush()

    version = DocumentVersion(
        document_id=document.id,
        storage_path="x.pdf",
        mime_type="application/pdf",
        size_bytes=10,
        checksum="abc",
        status="ready",
        extracted_content={
            "blocks": [
                {"type": "heading", "text": "Cell biology", "page": 1},
                {"type": "paragraph", "text": READY_PARAGRAPH, "page": 1},
            ]
        },
    )
    db_session.add(version)
    db_session.flush()

    document.current_version_id = version.id
    db_session.commit()

    for word in ("mitochondria", "produces"):
        start = READY_PARAGRAPH.index(word)
        db_session.add(
            ClozeCard(
                document_id=document.id,
                block_index=1,
                start_offset=start,
                end_offset=start + len(word),
                answer_text=word,
            )
        )
    db_session.commit()
    return document.id


def test_cloze_cards_require_auth(client: TestClient, ready_document_id: uuid.UUID) -> None:
    response = client.get(f"/v1/documents/{ready_document_id}/cloze-cards")
    assert response.status_code == 401


def test_list_cloze_cards_returns_the_words_an_admin_marked(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert {c["document_id"] for c in body} == {str(ready_document_id)}
    # The answer is never sent to the client -- the reveal happens entirely
    # client-side against the lesson text it already has.
    assert "answer_text" not in body[0]


def test_list_cloze_cards_is_idempotent_across_repeated_calls(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    first = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    second = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    assert [c["id"] for c in first] == [c["id"] for c in second]


def test_an_unmarked_lesson_has_no_review_words(
    authed_client: TestClient, db_session: Session, owner_user: AuthenticatedUser
) -> None:
    """Nothing is generated from the text any more: a lesson has exactly the
    words an admin marked, and until then Review has nothing to ask."""
    db_session.add(Profile(id=owner_user.id, settings=AccountSettings(user_id=owner_user.id)))
    db_session.commit()
    document_id = _create_ready_document(
        db_session, owner_user.id, "Unmarked", "Mitochondria generate cellular energy.", None
    )

    assert authed_client.get(f"/v1/documents/{document_id}/cloze-cards").json() == []
    assert authed_client.get(f"/v1/documents/{document_id}/cloze-cards/due").json() == []


def test_due_cards_include_never_reviewed_cards(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards/due")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_preview_intervals_match_what_grading_schedules() -> None:
    state = SchedulerState(ease_factor=2.5, interval_days=6, repetitions=2)
    preview = preview_intervals(state)
    for rating in ("again", "hard", "good", "easy"):
        assert getattr(preview, rating) == compute_next_state(rating, state).interval_days
    # A never-reviewed card: 1 day for again/hard/good, Easy's bonus on top.
    assert preview_intervals(None) == preview_intervals(
        SchedulerState(ease_factor=2.5, interval_days=0, repetitions=0)
    )
    assert (preview_intervals(None).again, preview_intervals(None).good) == (1, 1)


def test_due_cards_carry_next_intervals(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    due = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards/due").json()
    assert due[0]["next_intervals"] == {"again": 1, "hard": 1, "good": 1, "easy": 1}


def test_reviewing_a_card_removes_only_that_card_from_the_due_list(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    cards = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    card_id = cards[0]["id"]

    review = authed_client.post(
        f"/v1/documents/{ready_document_id}/cloze-cards/{card_id}/review",
        json={"rating": "good"},
    )
    assert review.status_code == 200
    state = review.json()
    assert state["cloze_card_id"] == card_id
    assert state["interval_days"] == 1
    assert state["repetitions"] == 1
    assert state["last_reviewed_at"] is not None

    due = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards/due").json()
    assert [c["id"] for c in due] == [cards[1]["id"]]


def test_review_requires_auth(client: TestClient, ready_document_id: uuid.UUID) -> None:
    response = client.post(
        f"/v1/documents/{ready_document_id}/cloze-cards/{uuid.uuid4()}/review",
        json={"rating": "good"},
    )
    assert response.status_code == 401


def test_review_of_unknown_card_404s(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = authed_client.post(
        f"/v1/documents/{ready_document_id}/cloze-cards/{uuid.uuid4()}/review",
        json={"rating": "good"},
    )
    assert response.status_code == 404


def test_review_auto_creates_profile_if_missing(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    ready_document_id: uuid.UUID,
    db_session: Session,
) -> None:
    """Regression test matching notebook/annotations: a user can hit this
    endpoint before ever calling GET /v1/me, which is what normally creates
    the profile row ClozeReviewState needs to FK against."""
    assert db_session.get(Profile, authenticated_user.id) is None

    cards = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    response = authed_client.post(
        f"/v1/documents/{ready_document_id}/cloze-cards/{cards[0]['id']}/review",
        json={"rating": "good"},
    )
    assert response.status_code == 200
    assert db_session.get(Profile, authenticated_user.id) is not None


def test_review_state_is_scoped_per_user(
    client: TestClient,
    authenticated_user: AuthenticatedUser,
    ready_document_id: uuid.UUID,
) -> None:
    """Two different users reviewing the same card get independent SM-2
    state, same as Flashcard/NotebookEntry's per-user isolation elsewhere."""
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    cards = client.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    card_id = cards[0]["id"]
    client.post(
        f"/v1/documents/{ready_document_id}/cloze-cards/{card_id}/review",
        json={"rating": "again"},
    )
    app.dependency_overrides.pop(get_current_user, None)

    # A second user hasn't reviewed anything -- their due list still shows
    # every card, including the one the first user just graded.
    other_user = AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")
    app.dependency_overrides[get_current_user] = lambda: other_user
    due = client.get(f"/v1/documents/{ready_document_id}/cloze-cards/due").json()
    app.dependency_overrides.pop(get_current_user, None)

    assert len(due) == 2


# --- GET /v1/me/review-summary ----------------------------------------------


def _create_ready_document(
    db_session: Session,
    owner_id: uuid.UUID,
    title: str,
    text: str,
    sub_chapter_id: uuid.UUID | None,
    mark: list[str] | None = None,
) -> uuid.UUID:
    document = Document(title=title, created_by=owner_id, sub_chapter_id=sub_chapter_id)
    db_session.add(document)
    db_session.flush()

    version = DocumentVersion(
        document_id=document.id,
        storage_path="x.pdf",
        mime_type="application/pdf",
        size_bytes=10,
        checksum="abc",
        status="ready",
        extracted_content={"blocks": [{"type": "paragraph", "text": text, "page": 1}]},
    )
    db_session.add(version)
    db_session.flush()

    document.current_version_id = version.id
    db_session.commit()
    if mark:
        _mark_words(db_session, document.id, text, mark)
    return document.id


def test_review_summary_rolls_up_due_counts_through_the_hierarchy(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    owner_id = authenticated_user.id
    db_session.add(Profile(id=owner_id, settings=AccountSettings(user_id=owner_id)))
    db_session.flush()

    book = Book(title="Book A", created_by=owner_id)
    db_session.add(book)
    db_session.flush()

    chapter1 = Chapter(book_id=book.id, title="Chapter 1", created_by=owner_id)
    chapter2 = Chapter(book_id=book.id, title="Chapter 2", created_by=owner_id)
    db_session.add_all([chapter1, chapter2])
    db_session.flush()

    sub1 = SubChapter(chapter_id=chapter1.id, title="Sub 1.1", created_by=owner_id)
    sub2 = SubChapter(chapter_id=chapter2.id, title="Sub 2.1", created_by=owner_id)
    db_session.add_all([sub1, sub2])
    db_session.commit()

    lesson_a_id = _create_ready_document(
        db_session,
        owner_id,
        "Lesson A",
        READY_PARAGRAPH,
        sub1.id,
        ["mitochondria", "produces"],
    )
    # Lesson B is never visited before the summary call below: the summary
    # reads each lesson's marked words itself rather than relying on someone
    # having opened that lesson's Review tab first.
    lesson_b_id = _create_ready_document(
        db_session,
        owner_id,
        "Lesson B",
        "An alternative approach requires careful validation testing.",
        sub2.id,
        ["alternative", "validation"],
    )
    uncategorized_id = _create_ready_document(
        db_session,
        owner_id,
        "Lesson C",
        "Distributed systems introduce partial failure scenarios.",
        None,
        ["Distributed", "scenarios"],
    )

    response = authed_client.get("/v1/me/review-summary")
    assert response.status_code == 200
    body = response.json()

    assert len(body["books"]) == 1
    book_body = body["books"][0]
    assert book_body["id"] == str(book.id)
    assert book_body["due_count"] == 4  # 2 words each from Lesson A and Lesson B

    chapters_by_title = {c["title"]: c for c in book_body["chapters"]}
    assert chapters_by_title["Chapter 1"]["due_count"] == 2
    assert chapters_by_title["Chapter 2"]["due_count"] == 2

    sub1_body = chapters_by_title["Chapter 1"]["sub_chapters"][0]
    assert sub1_body["due_count"] == 2
    assert [lesson["id"] for lesson in sub1_body["lessons"]] == [str(lesson_a_id)]
    assert sub1_body["lessons"][0]["due_count"] == 2

    sub2_body = chapters_by_title["Chapter 2"]["sub_chapters"][0]
    assert [lesson["id"] for lesson in sub2_body["lessons"]] == [str(lesson_b_id)]
    assert sub2_body["lessons"][0]["due_count"] == 2

    uncategorized_by_id = {lesson["id"]: lesson for lesson in body["uncategorized_lessons"]}
    assert uncategorized_by_id[str(uncategorized_id)]["due_count"] == 2


def test_review_summary_grading_reduces_the_count_but_keeps_the_lesson_listed(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    db_session.add(
        Profile(id=authenticated_user.id, settings=AccountSettings(user_id=authenticated_user.id))
    )
    db_session.commit()

    lesson_id = _create_ready_document(
        db_session,
        authenticated_user.id,
        "Solo Lesson",
        READY_PARAGRAPH,
        None,
        ["mitochondria", "produces"],
    )

    cards = authed_client.get(f"/v1/documents/{lesson_id}/cloze-cards").json()
    authed_client.post(
        f"/v1/documents/{lesson_id}/cloze-cards/{cards[0]['id']}/review",
        json={"rating": "good"},
    )

    body = authed_client.get("/v1/me/review-summary").json()
    lesson_body = next(
        lesson for lesson in body["uncategorized_lessons"] if lesson["id"] == str(lesson_id)
    )
    assert lesson_body["due_count"] == 1  # one graded (not due for a day), one still due


def test_review_summary_includes_zero_due_nodes(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
) -> None:
    """A book with nothing due today (and no chapters at all) still shows up
    in the tree at due_count 0 -- this is a full course-structure view, not
    a filtered due-only list."""
    db_session.add(
        Profile(id=authenticated_user.id, settings=AccountSettings(user_id=authenticated_user.id))
    )
    db_session.flush()

    book = Book(title="Empty Book", created_by=authenticated_user.id)
    db_session.add(book)
    db_session.commit()

    body = authed_client.get("/v1/me/review-summary").json()
    assert any(
        b["title"] == "Empty Book" and b["due_count"] == 0 and b["chapters"] == []
        for b in body["books"]
    )


# --- admin: marking and unmarking review words ------------------------------


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="admin@example.com")


@pytest.fixture
def as_admin(
    client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> Iterator[TestClient]:
    db_session.add(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def _mark(client: TestClient, document_id: uuid.UUID, word: str) -> Any:
    start = READY_PARAGRAPH.index(word)
    return client.post(
        f"/v1/documents/{document_id}/cloze-cards",
        json={"block_index": 1, "start_offset": start, "end_offset": start + len(word)},
    )


def test_marking_a_word_adds_it_to_the_lesson(
    as_admin: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = _mark(as_admin, ready_document_id, "cellular")
    assert response.status_code == 201
    card = response.json()
    assert (card["block_index"], card["start_offset"], card["end_offset"]) == (1, 26, 34)
    # Still not sent to clients: the gap is rendered from the lesson text.
    assert "answer_text" not in card

    cards = as_admin.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    assert len(cards) == 3


def test_the_answer_is_sliced_from_the_lesson_not_taken_from_the_request(
    as_admin: TestClient, ready_document_id: uuid.UUID, db_session: Session
) -> None:
    card_id = _mark(as_admin, ready_document_id, "cellular").json()["id"]
    card = db_session.get(ClozeCard, uuid.UUID(card_id))
    assert card is not None
    assert card.answer_text == "cellular"


def test_marking_requires_an_admin(authed_client: TestClient, ready_document_id: uuid.UUID) -> None:
    assert _mark(authed_client, ready_document_id, "cellular").status_code == 403


def test_marking_requires_auth(client: TestClient, ready_document_id: uuid.UUID) -> None:
    assert _mark(client, ready_document_id, "cellular").status_code == 401


def test_marking_refuses_a_heading(as_admin: TestClient, ready_document_id: uuid.UUID) -> None:
    response = as_admin.post(
        f"/v1/documents/{ready_document_id}/cloze-cards",
        json={"block_index": 0, "start_offset": 0, "end_offset": 4},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_block"


def test_marking_refuses_a_block_that_is_not_there(
    as_admin: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = as_admin.post(
        f"/v1/documents/{ready_document_id}/cloze-cards",
        json={"block_index": 99, "start_offset": 0, "end_offset": 4},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_block"


def test_marking_refuses_offsets_past_the_end_of_the_paragraph(
    as_admin: TestClient, ready_document_id: uuid.UUID
) -> None:
    response = as_admin.post(
        f"/v1/documents/{ready_document_id}/cloze-cards",
        json={"block_index": 1, "start_offset": 0, "end_offset": 5_000},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_offsets"


def test_marking_refuses_whitespace(as_admin: TestClient, ready_document_id: uuid.UUID) -> None:
    # The single space between "mitochondria" and "produces".
    response = as_admin.post(
        f"/v1/documents/{ready_document_id}/cloze-cards",
        json={"block_index": 1, "start_offset": 16, "end_offset": 17},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_offsets"


def test_marking_refuses_an_empty_range(as_admin: TestClient, ready_document_id: uuid.UUID) -> None:
    response = as_admin.post(
        f"/v1/documents/{ready_document_id}/cloze-cards",
        json={"block_index": 1, "start_offset": 4, "end_offset": 4},
    )
    assert response.status_code == 422


def test_marking_refuses_a_passage_that_overlaps_an_existing_word(
    as_admin: TestClient, ready_document_id: uuid.UUID
) -> None:
    """Two gaps over the same letters would nest, which the clients' splice
    does not model -- so the second is refused rather than silently merged."""
    response = as_admin.post(
        f"/v1/documents/{ready_document_id}/cloze-cards",
        json={"block_index": 1, "start_offset": 0, "end_offset": 16},  # "The mitochondria"
    )
    assert response.status_code == 409
    assert response.json()["code"] == "overlapping_card"


def test_marking_allows_a_passage_that_only_touches_an_existing_word(
    as_admin: TestClient, ready_document_id: uuid.UUID
) -> None:
    # "The " ends exactly where "mitochondria" starts -- adjacent, not
    # overlapping. The trailing space is included, so it isn't blank.
    response = as_admin.post(
        f"/v1/documents/{ready_document_id}/cloze-cards",
        json={"block_index": 1, "start_offset": 0, "end_offset": 4},
    )
    assert response.status_code == 201


def test_unmarking_removes_the_word_and_its_review_progress(
    act_as: Callable[[AuthenticatedUser], TestClient],
    admin_user: AuthenticatedUser,
    authenticated_user: AuthenticatedUser,
    ready_document_id: uuid.UUID,
    db_session: Session,
) -> None:
    # Two users in one test, so the signed-in one is switched explicitly
    # rather than by fixture ordering -- `as_admin` and `authed_client`
    # together would leave whichever resolved last in charge of both.
    db_session.add(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.commit()

    learner = act_as(authenticated_user)
    cards = learner.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    card_id = cards[0]["id"]
    # A learner grades it before it is unmarked, so the cascade has something
    # to take with it.
    review = learner.post(
        f"/v1/documents/{ready_document_id}/cloze-cards/{card_id}/review",
        json={"rating": "good"},
    )
    assert review.status_code == 200
    state_id = uuid.UUID(review.json()["id"])

    admin = act_as(admin_user)
    response = admin.delete(f"/v1/documents/{ready_document_id}/cloze-cards/{card_id}")
    assert response.status_code == 204
    assert db_session.get(ClozeCard, uuid.UUID(card_id)) is None
    assert db_session.get(ClozeReviewState, state_id) is None

    left = admin.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    assert [c["id"] for c in left] == [cards[1]["id"]]


def test_unmarking_requires_an_admin(
    authed_client: TestClient, ready_document_id: uuid.UUID
) -> None:
    cards = authed_client.get(f"/v1/documents/{ready_document_id}/cloze-cards").json()
    response = authed_client.delete(
        f"/v1/documents/{ready_document_id}/cloze-cards/{cards[0]['id']}"
    )
    assert response.status_code == 403


def test_unmarking_a_word_from_another_lesson_404s(
    as_admin: TestClient,
    ready_document_id: uuid.UUID,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    other_id = _create_ready_document(
        db_session, admin_user.id, "Other", READY_PARAGRAPH, None, ["mitochondria"]
    )
    other_card = as_admin.get(f"/v1/documents/{other_id}/cloze-cards").json()[0]

    response = as_admin.delete(f"/v1/documents/{ready_document_id}/cloze-cards/{other_card['id']}")
    assert response.status_code == 404
