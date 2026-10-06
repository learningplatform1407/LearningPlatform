import hashlib
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.flashcards.constants import FlashcardScope, FlashcardStatus
from app.flashcards.models import Flashcard, FlashcardReviewState
from app.main import app
from app.progress.models import QuestionProgress
from app.srs.scheduler import SchedulerState, compute_next_state
from app.users.models import AccountSettings, Profile


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.UUID(int=1), email="admin@example.com")


@pytest.fixture
def other_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.UUID(int=2), email="other@example.com")


@pytest.fixture
def document_id(client: TestClient, admin_user: AuthenticatedUser, db_session: Session) -> str:
    # Deliberately does *not* depend on an `admin_client`-style fixture —
    # that pattern only pops its `get_current_user` override at test
    # teardown, which would leak admin auth into any later request in the
    # same test that's meant to exercise the unauthenticated path.
    db_session.add(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.commit()
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: admin_user

    fake_pdf_bytes = b"%PDF-1.4 fake"
    checksum = hashlib.sha256(fake_pdf_bytes).hexdigest()
    with (
        patch("app.documents.service.download_object", return_value=fake_pdf_bytes),
        patch("app.documents.service.extract_pdf", return_value=[]),
    ):
        response = client.post(
            "/v1/documents",
            json={
                "title": "Lesson 1",
                "storage_path": "lesson1.pdf",
                "mime_type": "application/pdf",
                "size_bytes": len(fake_pdf_bytes),
                "checksum": checksum,
            },
        )
    if previous_override is not None:
        app.dependency_overrides[get_current_user] = previous_override
    else:
        app.dependency_overrides.pop(get_current_user, None)
    return response.json()["id"]  # type: ignore[no-any-return]


@pytest.fixture
def admin_client(
    client: TestClient, document_id: str, admin_user: AuthenticatedUser
) -> Iterator[TestClient]:
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def _add_card(
    db: Session,
    document_id: str,
    created_by: uuid.UUID,
    *,
    scope: FlashcardScope = FlashcardScope.OFFICIAL,
    status: FlashcardStatus = FlashcardStatus.PUBLISHED,
    front: str = "Front",
    back: str = "Back",
    order_index: int = 0,
) -> Flashcard:
    card = Flashcard(
        document_id=uuid.UUID(document_id),
        scope=scope,
        status=status,
        front_text=front,
        back_text=back,
        order_index=order_index,
        created_by=created_by,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def _profile(db: Session, user: AuthenticatedUser) -> Profile:
    profile = db.get(Profile, user.id)
    if profile is None:
        profile = Profile(id=user.id, role="student", settings=AccountSettings(user_id=user.id))
        db.add(profile)
        db.commit()
    return profile


# --- auth -------------------------------------------------------------------


def test_listing_flashcards_requires_auth(client: TestClient, document_id: str) -> None:
    response = client.get(f"/v1/documents/{document_id}/flashcards")
    assert response.status_code == 401


def test_due_flashcards_require_auth(client: TestClient, document_id: str) -> None:
    response = client.get(f"/v1/documents/{document_id}/flashcards/due")
    assert response.status_code == 401


def test_flashcards_are_empty_by_default(authed_client: TestClient, document_id: str) -> None:
    response = authed_client.get(f"/v1/documents/{document_id}/flashcards")
    assert response.status_code == 200
    assert response.json() == []


# --- visibility: the whole point of `scope` ---------------------------------


def test_a_learner_never_sees_another_learners_personal_card(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
    other_user: AuthenticatedUser,
) -> None:
    """The single most important assertion in this file. `scope='personal'`
    means private, and `apply_visible_filter` is the only thing enforcing it."""
    _profile(db_session, other_user)
    _add_card(db_session, document_id, admin_user.id, front="Official card")
    theirs = _add_card(
        db_session,
        document_id,
        other_user.id,
        scope=FlashcardScope.PERSONAL,
        front="Their private card",
    )

    listed = authed_client.get(f"/v1/documents/{document_id}/flashcards").json()
    assert [card["front_text"] for card in listed] == ["Official card"]

    deck = authed_client.get(f"/v1/documents/{document_id}/flashcards/due").json()
    assert [card["front_text"] for card in deck] == ["Official card"]

    # Not merely hidden from the list — unreachable by id, and 404 rather
    # than 403 so probing can't confirm it exists.
    review = authed_client.post(f"/v1/flashcards/{theirs.id}/review", json={"rating": "good"})
    assert review.status_code == 404
    edit = authed_client.patch(f"/v1/flashcards/{theirs.id}", json={"front_text": "x"})
    assert edit.status_code == 404
    assert authed_client.delete(f"/v1/flashcards/{theirs.id}").status_code == 404


def test_official_cards_are_visible_to_every_learner(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    _add_card(db_session, document_id, admin_user.id, front="Shared")
    listed = authed_client.get(f"/v1/documents/{document_id}/flashcards").json()
    assert [card["front_text"] for card in listed] == ["Shared"]
    assert listed[0]["scope"] == "official"
    assert listed[0]["is_mine"] is False


def test_scope_filter_narrows_the_view(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
    authenticated_user: AuthenticatedUser,
) -> None:
    _profile(db_session, authenticated_user)
    _add_card(db_session, document_id, admin_user.id, front="Official")
    _add_card(
        db_session,
        document_id,
        authenticated_user.id,
        scope=FlashcardScope.PERSONAL,
        front="Mine",
    )

    def fronts(scope: str) -> list[str]:
        response = authed_client.get(
            f"/v1/documents/{document_id}/flashcards", params={"scope": scope}
        )
        return sorted(card["front_text"] for card in response.json())

    assert fronts("all") == ["Mine", "Official"]
    assert fronts("official") == ["Official"]
    assert fronts("personal") == ["Mine"]


def test_draft_and_archived_cards_never_appear(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    _add_card(db_session, document_id, admin_user.id, front="Live")
    _add_card(db_session, document_id, admin_user.id, status=FlashcardStatus.DRAFT, front="Staged")
    _add_card(
        db_session, document_id, admin_user.id, status=FlashcardStatus.ARCHIVED, front="Retired"
    )

    listed = authed_client.get(f"/v1/documents/{document_id}/flashcards").json()
    assert [card["front_text"] for card in listed] == ["Live"]


# --- personal authoring -----------------------------------------------------


def test_creating_a_card_always_makes_it_personal(
    authed_client: TestClient, document_id: str
) -> None:
    """Even when the payload asks for `official`. Provenance is decided by the
    endpoint, never by the request body -- see FlashcardScope."""
    response = authed_client.post(
        f"/v1/documents/{document_id}/flashcards",
        json={"front_text": "Q", "back_text": "A", "scope": "official"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["scope"] == "personal"
    assert body["is_mine"] is True


def test_creating_a_card_rejects_blank_text(authed_client: TestClient, document_id: str) -> None:
    response = authed_client.post(
        f"/v1/documents/{document_id}/flashcards", json={"front_text": "", "back_text": "A"}
    )
    assert response.status_code == 422


def test_an_admin_adding_a_card_while_studying_gets_a_personal_card(
    admin_client: TestClient, document_id: str
) -> None:
    """The behaviour a role-derived `scope` would get wrong."""
    response = admin_client.post(
        f"/v1/documents/{document_id}/flashcards",
        json={"front_text": "My own mnemonic", "back_text": "..."},
    )
    assert response.status_code == 201
    assert response.json()["scope"] == "personal"


def test_owner_can_edit_and_delete_their_card(
    authed_client: TestClient, document_id: str, db_session: Session
) -> None:
    created = authed_client.post(
        f"/v1/documents/{document_id}/flashcards", json={"front_text": "Q", "back_text": "A"}
    ).json()

    updated = authed_client.patch(
        f"/v1/flashcards/{created['id']}", json={"back_text": "Better answer"}
    )
    assert updated.status_code == 200
    assert updated.json()["back_text"] == "Better answer"
    assert updated.json()["front_text"] == "Q"

    assert authed_client.delete(f"/v1/flashcards/{created['id']}").status_code == 204
    # Hard-deleted, not archived: it is the learner's own data.
    assert db_session.get(Flashcard, uuid.UUID(created["id"])) is None


def test_a_learner_cannot_edit_an_official_card(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    card = _add_card(db_session, document_id, admin_user.id)
    response = authed_client.patch(f"/v1/flashcards/{card.id}", json={"front_text": "Vandalised"})
    assert response.status_code == 404


def test_a_learner_cannot_delete_an_official_card(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    card = _add_card(db_session, document_id, admin_user.id)
    assert authed_client.delete(f"/v1/flashcards/{card.id}").status_code == 403


def test_an_admin_deleting_an_official_card_archives_it(
    admin_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """Asymmetric with a personal card on purpose: other people's review
    history points at an official card, so it is retired, not destroyed."""
    card = _add_card(db_session, document_id, admin_user.id)
    assert admin_client.delete(f"/v1/flashcards/{card.id}").status_code == 204

    db_session.expire_all()
    stored = db_session.get(Flashcard, card.id)
    assert stored is not None
    assert stored.status == FlashcardStatus.ARCHIVED


# --- the deck ---------------------------------------------------------------


def test_the_deck_puts_due_cards_before_new_ones(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
    authenticated_user: AuthenticatedUser,
) -> None:
    profile = _profile(db_session, authenticated_user)
    new_card = _add_card(db_session, document_id, admin_user.id, front="Never seen")
    due_card = _add_card(db_session, document_id, admin_user.id, front="Overdue")
    db_session.add(
        FlashcardReviewState(
            user_id=profile.id,
            flashcard_id=due_card.id,
            ease_factor=2.5,
            interval_days=1,
            repetitions=1,
            due_at=datetime.now(UTC) - timedelta(days=2),
            last_reviewed_at=datetime.now(UTC) - timedelta(days=3),
        )
    )
    db_session.commit()

    deck = authed_client.get(f"/v1/documents/{document_id}/flashcards/due").json()
    assert [card["front_text"] for card in deck] == ["Overdue", "Never seen"]
    assert deck[0]["is_new"] is False
    assert deck[0]["due_at"] is not None
    assert deck[1]["is_new"] is True
    assert deck[1]["due_at"] is None
    assert {card["id"] for card in deck} == {str(due_card.id), str(new_card.id)}


def test_the_deck_excludes_cards_that_are_not_due_yet(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
    authenticated_user: AuthenticatedUser,
) -> None:
    profile = _profile(db_session, authenticated_user)
    card = _add_card(db_session, document_id, admin_user.id)
    db_session.add(
        FlashcardReviewState(
            user_id=profile.id,
            flashcard_id=card.id,
            ease_factor=2.5,
            interval_days=6,
            repetitions=2,
            due_at=datetime.now(UTC) + timedelta(days=6),
            last_reviewed_at=datetime.now(UTC),
        )
    )
    db_session.commit()

    assert authed_client.get(f"/v1/documents/{document_id}/flashcards/due").json() == []


def test_the_deck_respects_limit(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    for index in range(5):
        _add_card(db_session, document_id, admin_user.id, front=f"Card {index}")

    deck = authed_client.get(
        f"/v1/documents/{document_id}/flashcards/due", params={"limit": 2}
    ).json()
    assert len(deck) == 2


def test_the_deck_carries_the_back_text(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """Unlike a question, a flashcard's back is not an answer key, so it ships
    with the deck and the client holds it until tapped -- no second request."""
    _add_card(db_session, document_id, admin_user.id, front="Front", back="Back")
    deck = authed_client.get(f"/v1/documents/{document_id}/flashcards/due").json()
    assert deck[0]["back_text"] == "Back"


# --- grading ----------------------------------------------------------------


@pytest.mark.parametrize("rating", ["again", "hard", "good", "easy"])
def test_each_rating_schedules_what_the_scheduler_predicts(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
    rating: str,
) -> None:
    card = _add_card(db_session, document_id, admin_user.id)
    response = authed_client.post(f"/v1/flashcards/{card.id}/review", json={"rating": rating})
    assert response.status_code == 200

    expected = compute_next_state(
        rating,  # type: ignore[arg-type]
        SchedulerState(ease_factor=2.5, interval_days=0, repetitions=0),
    )
    body = response.json()
    assert body["interval_days"] == expected.interval_days
    assert body["repetitions"] == expected.repetitions
    assert body["ease_factor"] == pytest.approx(expected.ease_factor)
    assert body["flashcard_id"] == str(card.id)
    assert body["last_reviewed_at"] is not None


def test_grading_a_card_drops_it_from_the_deck(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    card = _add_card(db_session, document_id, admin_user.id)
    authed_client.post(f"/v1/flashcards/{card.id}/review", json={"rating": "good"})
    assert authed_client.get(f"/v1/documents/{document_id}/flashcards/due").json() == []


def test_grading_twice_reuses_one_state_row(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """The (user, card) unique constraint means a second grade updates rather
    than inserting, which is what keeps "new" meaning "no row"."""
    card = _add_card(db_session, document_id, admin_user.id)
    authed_client.post(f"/v1/flashcards/{card.id}/review", json={"rating": "good"})
    authed_client.post(f"/v1/flashcards/{card.id}/review", json={"rating": "again"})

    states = list(
        db_session.scalars(
            select(FlashcardReviewState).where(FlashcardReviewState.flashcard_id == card.id)
        )
    )
    assert len(states) == 1
    assert states[0].repetitions == 0  # "again" reset it


def test_grading_never_touches_question_progress(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """A self-rating is not an answer. Writing it would corrupt the question
    bank's success/failing/pending/average-score stats."""
    card = _add_card(db_session, document_id, admin_user.id)
    authed_client.post(f"/v1/flashcards/{card.id}/review", json={"rating": "good"})
    assert list(db_session.scalars(select(QuestionProgress))) == []


def test_grading_rejects_an_unknown_card(authed_client: TestClient, document_id: str) -> None:
    response = authed_client.post(f"/v1/flashcards/{uuid.uuid4()}/review", json={"rating": "good"})
    assert response.status_code == 404


def test_editing_a_suspended_card_still_reports_it_as_suspended(
    authed_client: TestClient, document_id: str
) -> None:
    """`suspended` is documented as computed per caller, so every response
    carrying a card has to supply it. PATCH used to omit the review state and
    report every edited card as back in the rotation."""
    created = authed_client.post(
        f"/v1/documents/{document_id}/flashcards", json={"front_text": "Q", "back_text": "A"}
    ).json()
    authed_client.put(f"/v1/flashcards/{created['id']}/suspension", json={"suspended": True})

    edited = authed_client.patch(f"/v1/flashcards/{created['id']}", json={"back_text": "A2"})

    assert edited.status_code == 200
    assert edited.json()["suspended"] is True


# --- suspension (opting a card out of the rotation) -------------------------


def test_suspending_a_card_takes_it_out_of_the_deck_and_the_counts(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    card = _add_card(db_session, document_id, admin_user.id, front="Known already")
    _add_card(db_session, document_id, admin_user.id, front="Still learning")

    response = authed_client.put(f"/v1/flashcards/{card.id}/suspension", json={"suspended": True})
    assert response.status_code == 200
    assert response.json()["suspended"] is True

    deck = authed_client.get(f"/v1/documents/{document_id}/flashcards/due").json()
    assert [c["front_text"] for c in deck] == ["Still learning"]

    # "Excluded shouldn't be taken into account" — not as due, not as new.
    lessons = authed_client.get("/v1/me/flashcard-summary").json()["uncategorized_lessons"]
    assert lessons[0]["due_count"] == 0
    assert lessons[0]["new_count"] == 1


def test_a_suspended_card_still_appears_in_the_lesson_list(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """The one surface that shows suspended cards, and it has to be — if it
    hid them there would be no way to put one back in the rotation."""
    card = _add_card(db_session, document_id, admin_user.id, front="Parked")
    authed_client.put(f"/v1/flashcards/{card.id}/suspension", json={"suspended": True})

    listed = authed_client.get(f"/v1/documents/{document_id}/flashcards").json()
    assert [(c["front_text"], c["suspended"]) for c in listed] == [("Parked", True)]


def test_un_suspending_restores_the_card_with_its_schedule_intact(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """Suspension is a filter, not a reset: a card parked at a long interval
    comes back at that interval rather than starting over."""
    card = _add_card(db_session, document_id, admin_user.id)
    authed_client.post(f"/v1/flashcards/{card.id}/review", json={"rating": "easy"})
    graded = db_session.scalar(
        select(FlashcardReviewState).where(FlashcardReviewState.flashcard_id == card.id)
    )
    assert graded is not None
    interval_before = graded.interval_days
    reps_before = graded.repetitions
    ease_before = graded.ease_factor

    authed_client.put(f"/v1/flashcards/{card.id}/suspension", json={"suspended": True})
    restored = authed_client.put(
        f"/v1/flashcards/{card.id}/suspension", json={"suspended": False}
    ).json()

    assert restored["suspended"] is False
    assert restored["interval_days"] == interval_before
    assert restored["repetitions"] == reps_before
    assert restored["ease_factor"] == pytest.approx(ease_before)


def test_suspending_a_never_graded_card_leaves_it_new(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """A state row created purely to carry the flag must not make the card
    look reviewed — "new" means no row *or* never graded."""
    card = _add_card(db_session, document_id, admin_user.id)
    authed_client.put(f"/v1/flashcards/{card.id}/suspension", json={"suspended": True})
    authed_client.put(f"/v1/flashcards/{card.id}/suspension", json={"suspended": False})

    deck = authed_client.get(f"/v1/documents/{document_id}/flashcards/due").json()
    assert len(deck) == 1
    assert deck[0]["is_new"] is True
    assert deck[0]["due_at"] is None


def test_grading_a_suspended_card_is_rejected(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """The backend enforces what the runner merely hides."""
    card = _add_card(db_session, document_id, admin_user.id)
    authed_client.put(f"/v1/flashcards/{card.id}/suspension", json={"suspended": True})

    response = authed_client.post(f"/v1/flashcards/{card.id}/review", json={"rating": "good"})
    assert response.status_code == 409
    assert response.json()["code"] == "card_suspended"


def test_suspension_is_per_user_on_a_shared_official_card(
    client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
    authenticated_user: AuthenticatedUser,
    other_user: AuthenticatedUser,
) -> None:
    """One learner retiring a shared card must not remove it from anybody
    else's deck. This is why the flag lives on the review state."""
    card = _add_card(db_session, document_id, admin_user.id, front="Shared")
    _profile(db_session, authenticated_user)
    _profile(db_session, other_user)

    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    try:
        client.put(f"/v1/flashcards/{card.id}/suspension", json={"suspended": True})
        assert client.get(f"/v1/documents/{document_id}/flashcards/due").json() == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    app.dependency_overrides[get_current_user] = lambda: other_user
    try:
        deck = client.get(f"/v1/documents/{document_id}/flashcards/due").json()
        assert [c["front_text"] for c in deck] == ["Shared"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_suspending_is_idempotent(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
) -> None:
    """PUT with a field, not a toggle — a retry or a double-tap must not flip
    the card back in."""
    card = _add_card(db_session, document_id, admin_user.id)
    for _ in range(2):
        response = authed_client.put(
            f"/v1/flashcards/{card.id}/suspension", json={"suspended": True}
        )
        assert response.json()["suspended"] is True

    states = list(
        db_session.scalars(
            select(FlashcardReviewState).where(FlashcardReviewState.flashcard_id == card.id)
        )
    )
    assert len(states) == 1


def test_suspension_requires_auth(client: TestClient, document_id: str) -> None:
    response = client.put(f"/v1/flashcards/{uuid.uuid4()}/suspension", json={"suspended": True})
    assert response.status_code == 401


def test_cannot_suspend_another_learners_personal_card(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    other_user: AuthenticatedUser,
) -> None:
    _profile(db_session, other_user)
    theirs = _add_card(
        db_session, document_id, other_user.id, scope=FlashcardScope.PERSONAL, front="Theirs"
    )
    blocked = authed_client.put(f"/v1/flashcards/{theirs.id}/suspension", json={"suspended": True})
    assert blocked.status_code == 404


# --- admin import -----------------------------------------------------------


def _payload(document_id: str, external_id: str = "fc-1", front: str = "Front") -> dict[str, Any]:
    return {
        "flashcards": [
            {
                "external_id": external_id,
                "document_id": document_id,
                "front_text": front,
                "back_text": "Back",
            }
        ]
    }


def test_import_requires_admin(authed_client: TestClient, document_id: str) -> None:
    response = authed_client.post("/v1/flashcards/import", json=_payload(document_id))
    assert response.status_code == 403


def test_import_creates_official_cards(
    admin_client: TestClient, document_id: str, db_session: Session
) -> None:
    response = admin_client.post("/v1/flashcards/import", json=_payload(document_id))
    assert response.status_code == 200
    assert response.json() == {"created": 1, "updated": 0, "skipped": 0, "errors": []}

    card = db_session.scalar(select(Flashcard).where(Flashcard.external_id == "fc-1"))
    assert card is not None
    assert card.scope == FlashcardScope.OFFICIAL


def test_import_is_idempotent_on_external_id(
    admin_client: TestClient, document_id: str, db_session: Session
) -> None:
    admin_client.post("/v1/flashcards/import", json=_payload(document_id))
    second = admin_client.post(
        "/v1/flashcards/import", json=_payload(document_id, front="Corrected")
    )
    assert second.json() == {"created": 0, "updated": 1, "skipped": 0, "errors": []}

    cards = list(db_session.scalars(select(Flashcard).where(Flashcard.external_id == "fc-1")))
    assert len(cards) == 1
    assert cards[0].front_text == "Corrected"


def test_import_dry_run_commits_nothing(
    admin_client: TestClient, document_id: str, db_session: Session
) -> None:
    """The preview runs the real insert path inside a SAVEPOINT and rolls it
    back, so it can never disagree with what a commit would do."""
    response = admin_client.post(
        "/v1/flashcards/import", params={"dry_run": True}, json=_payload(document_id)
    )
    assert response.json() == {"created": 1, "updated": 0, "skipped": 0, "errors": []}
    assert db_session.scalar(select(Flashcard).where(Flashcard.external_id == "fc-1")) is None


def test_import_rejects_an_unknown_lesson(admin_client: TestClient) -> None:
    response = admin_client.post("/v1/flashcards/import", json=_payload(str(uuid.uuid4())))
    body = response.json()
    assert body["created"] == 0
    assert body["errors"] == [{"index": 0, "field": "document_id", "message": "Unknown lesson"}]


def test_import_rejects_duplicate_external_ids_in_one_payload(
    admin_client: TestClient, document_id: str
) -> None:
    payload = _payload(document_id)
    payload["flashcards"].append(dict(payload["flashcards"][0]))
    response = admin_client.post("/v1/flashcards/import", json=payload)
    body = response.json()
    assert body["created"] == 0
    assert body["errors"][0]["field"] == "external_id"


def test_import_rejects_too_many_cards(admin_client: TestClient, document_id: str) -> None:
    payload = {
        "flashcards": [
            {
                "external_id": f"fc-{index}",
                "document_id": document_id,
                "front_text": "Front",
                "back_text": "Back",
            }
            for index in range(501)
        ]
    }
    response = admin_client.post("/v1/flashcards/import", json=payload)
    assert response.status_code == 400
    assert response.json()["code"] == "too_many_flashcards"


# --- summary ----------------------------------------------------------------


def test_summary_counts_due_and_new_separately(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    admin_user: AuthenticatedUser,
    authenticated_user: AuthenticatedUser,
) -> None:
    profile = _profile(db_session, authenticated_user)
    due_card = _add_card(db_session, document_id, admin_user.id, front="Overdue")
    _add_card(db_session, document_id, admin_user.id, front="New one")
    _add_card(db_session, document_id, admin_user.id, front="New two")
    db_session.add(
        FlashcardReviewState(
            user_id=profile.id,
            flashcard_id=due_card.id,
            ease_factor=2.5,
            interval_days=1,
            repetitions=1,
            due_at=datetime.now(UTC) - timedelta(days=1),
            last_reviewed_at=datetime.now(UTC) - timedelta(days=2),
        )
    )
    db_session.commit()

    response = authed_client.get("/v1/me/flashcard-summary")
    assert response.status_code == 200
    lessons = response.json()["uncategorized_lessons"]
    assert len(lessons) == 1
    assert lessons[0]["due_count"] == 1
    assert lessons[0]["new_count"] == 2


def test_summary_requires_auth(client: TestClient) -> None:
    assert client.get("/v1/me/flashcard-summary").status_code == 401


def test_summary_ignores_other_learners_personal_cards(
    authed_client: TestClient,
    document_id: str,
    db_session: Session,
    other_user: AuthenticatedUser,
) -> None:
    _profile(db_session, other_user)
    _add_card(db_session, document_id, other_user.id, scope=FlashcardScope.PERSONAL, front="Theirs")

    lessons = authed_client.get("/v1/me/flashcard-summary").json()["uncategorized_lessons"]
    assert lessons[0]["due_count"] == 0
    assert lessons[0]["new_count"] == 0
