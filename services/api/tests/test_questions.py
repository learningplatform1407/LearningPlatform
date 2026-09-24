from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.main import app
from app.users.models import AccountSettings, Profile


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=UUID(int=1), email="admin@example.com")


@pytest.fixture
def admin_client(
    client: TestClient, admin_user: AuthenticatedUser, db_session: Session
) -> TestClient:
    db_session.add(
        Profile(id=admin_user.id, role="admin", settings=AccountSettings(user_id=admin_user.id))
    )
    db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: admin_user
    yield client
    app.dependency_overrides.pop(get_current_user, None)


def _single_payload(**overrides: object) -> dict:
    payload = {
        "external_id": "cardio-001",
        "prompt": "Which drug class lowers preload?",
        "kind": "single",
        "scoring_scheme": "single_4",
        "options": [
            {"id": "a", "text": "Nitrates"},
            {"id": "b", "text": "Vasopressors"},
        ],
        "correct_option_ids": ["a"],
        "rationales": {"a": "Venodilation reduces venous return."},
        "status": "published",
        "tags": [],
    }
    payload.update(overrides)
    return payload


def _multi_payload(**overrides: object) -> dict:
    payload = {
        "external_id": "cardio-002",
        "prompt": "Which of the following reduce cardiac preload?",
        "kind": "multi",
        "scoring_scheme": "multi_5_per_option",
        "options": [
            {"id": "a", "text": "Nitroglycerin"},
            {"id": "b", "text": "Furosemide"},
            {"id": "c", "text": "Phenylephrine"},
            {"id": "d", "text": "Noradrenaline"},
            {"id": "e", "text": "Dobutamine"},
        ],
        "correct_option_ids": ["a", "b"],
        "rationales": {},
        "status": "published",
        "tags": [],
    }
    payload.update(overrides)
    return payload


# --- auth ---------------------------------------------------------------


def test_list_questions_requires_admin(authed_client: TestClient) -> None:
    response = authed_client.get("/v1/questions")
    assert response.status_code == 403


def test_create_question_requires_admin(authed_client: TestClient) -> None:
    response = authed_client.post("/v1/questions", json=_single_payload())
    assert response.status_code == 403


def test_tags_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/tags")
    assert response.status_code == 401


def test_tags_does_not_require_admin(authed_client: TestClient) -> None:
    response = authed_client.get("/v1/tags")
    assert response.status_code == 200
    assert response.json() == []


# --- CRUD -----------------------------------------------------------------


def test_create_and_read_question(admin_client: TestClient) -> None:
    create_response = admin_client.post("/v1/questions", json=_single_payload())
    assert create_response.status_code == 200
    body = create_response.json()
    assert body["kind"] == "single"
    assert body["options"] == [
        {"id": "a", "text": "Nitrates"},
        {"id": "b", "text": "Vasopressors"},
    ]

    read_response = admin_client.get(f"/v1/questions/{body['id']}")
    assert read_response.status_code == 200
    assert read_response.json()["prompt"] == body["prompt"]


def test_archive_question_never_hard_deletes(admin_client: TestClient) -> None:
    created = admin_client.post("/v1/questions", json=_single_payload()).json()
    response = admin_client.delete(f"/v1/questions/{created['id']}")
    assert response.status_code == 200
    assert response.json()["status"] == "archived"

    # Still resolvable — archived, not deleted.
    read_response = admin_client.get(f"/v1/questions/{created['id']}")
    assert read_response.status_code == 200
    assert read_response.json()["status"] == "archived"


def test_create_question_rejects_a_duplicate_external_id(admin_client: TestClient) -> None:
    assert admin_client.post("/v1/questions", json=_single_payload()).status_code == 200

    response = admin_client.post("/v1/questions", json=_single_payload(prompt="Reworded"))

    assert response.status_code == 409
    assert response.json()["code"] == "duplicate_external_id"


def test_list_questions_rejects_out_of_range_pagination(admin_client: TestClient) -> None:
    # SQLite reads a negative LIMIT as "no limit" and Postgres refuses it, so
    # without the bound this passes locally and 500s in production.
    assert admin_client.get("/v1/questions", params={"limit": -1}).status_code == 422
    assert admin_client.get("/v1/questions", params={"offset": -5}).status_code == 422
    assert admin_client.get("/v1/questions", params={"limit": 10_000}).status_code == 422
    assert admin_client.get("/v1/questions", params={"limit": 200}).status_code == 200


def test_update_question_rejects_explicit_null_on_required_field(
    admin_client: TestClient,
) -> None:
    created = admin_client.post("/v1/questions", json=_single_payload()).json()
    response = admin_client.patch(f"/v1/questions/{created['id']}", json={"prompt": None})
    assert response.status_code == 422
    assert any(d["field"] == "prompt" for d in response.json()["details"])

    # Never applied — the question is untouched.
    read_response = admin_client.get(f"/v1/questions/{created['id']}")
    assert read_response.json()["prompt"] == created["prompt"]


def test_update_question_allows_null_on_nullable_field(admin_client: TestClient) -> None:
    created = admin_client.post(
        "/v1/questions", json=_single_payload(explanation="some explanation")
    ).json()
    response = admin_client.patch(f"/v1/questions/{created['id']}", json={"explanation": None})
    assert response.status_code == 200
    assert response.json()["explanation"] is None


def test_update_question_patches_only_given_fields(admin_client: TestClient) -> None:
    created = admin_client.post("/v1/questions", json=_single_payload()).json()
    response = admin_client.patch(
        f"/v1/questions/{created['id']}", json={"explanation": "Because venodilation."}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["explanation"] == "Because venodilation."
    assert body["prompt"] == created["prompt"]


# --- validation -------------------------------------------------------------


def test_rejects_duplicate_option_ids(admin_client: TestClient) -> None:
    payload = _single_payload(options=[{"id": "a", "text": "x"}, {"id": "a", "text": "y"}])
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422
    assert any(d["field"] == "options" for d in response.json()["details"])


def test_rejects_correct_option_id_not_in_options(admin_client: TestClient) -> None:
    payload = _single_payload(correct_option_ids=["z"])
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422
    assert any(d["field"] == "correct_option_ids" for d in response.json()["details"])


def test_rejects_empty_correct_option_ids(admin_client: TestClient) -> None:
    payload = _single_payload(correct_option_ids=[])
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422


def test_rejects_single_kind_with_multiple_correct_options(admin_client: TestClient) -> None:
    payload = _single_payload(correct_option_ids=["a", "b"])
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422


def test_rejects_duplicate_correct_option_ids(admin_client: TestClient) -> None:
    payload = _multi_payload(correct_option_ids=["a", "a"])
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422
    messages = [d["message"] for d in response.json()["details"]]
    assert any("duplicates" in message for message in messages)

    # A single-kind question given ["a", "a"] has one distinct answer, so it
    # must report the duplicate — not a misleading "only one correct option".
    single = admin_client.post("/v1/questions", json=_single_payload(correct_option_ids=["a", "a"]))
    single_messages = [d["message"] for d in single.json()["details"]]
    assert any("duplicates" in message for message in single_messages)
    assert not any("only one correct option" in message for message in single_messages)


def test_rejects_unknown_scoring_scheme(admin_client: TestClient) -> None:
    payload = _single_payload(scoring_scheme="triple_negative_marking")
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422


def test_rejects_scoring_scheme_inconsistent_with_kind(admin_client: TestClient) -> None:
    payload = _single_payload(scoring_scheme="multi_5_per_option")
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422


def test_rejects_multi_5_per_option_without_five_options(admin_client: TestClient) -> None:
    payload = _multi_payload(
        options=[{"id": "a", "text": "x"}, {"id": "b", "text": "y"}],
        correct_option_ids=["a"],
    )
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422


def test_rejects_unknown_tag_slug(admin_client: TestClient) -> None:
    payload = _single_payload(tags=["cardiology"])
    response = admin_client.post("/v1/questions", json=payload)
    assert response.status_code == 422
    assert any(d["field"] == "tags" for d in response.json()["details"])


# --- tags -------------------------------------------------------------------


def test_tags_count_excludes_draft_and_archived(admin_client: TestClient) -> None:
    import_response = admin_client.post(
        "/v1/questions/import",
        json={
            "allow_new_tags": True,
            "questions": [
                _single_payload(external_id="q1", status="published", tags=["cardiology"]),
                _single_payload(external_id="q2", status="draft", tags=["cardiology"]),
                _single_payload(external_id="q3", status="published", tags=["cardiology"]),
            ],
        },
    )
    assert import_response.status_code == 200
    assert import_response.json()["created"] == 3

    tags_response = admin_client.get("/v1/tags")
    assert tags_response.status_code == 200
    body = tags_response.json()
    assert len(body) == 1
    assert body[0]["slug"] == "cardiology"
    assert body[0]["question_count"] == 2


# --- import -----------------------------------------------------------------


def test_import_dry_run_writes_nothing(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/v1/questions/import?dry_run=true",
        json={"allow_new_tags": True, "questions": [_single_payload()]},
    )
    assert response.status_code == 200
    assert response.json()["created"] == 1

    list_response = admin_client.get("/v1/questions")
    assert list_response.json() == []


def test_import_commits_when_not_dry_run(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/v1/questions/import",
        json={"allow_new_tags": True, "questions": [_single_payload()]},
    )
    assert response.status_code == 200
    assert response.json()["created"] == 1

    list_response = admin_client.get("/v1/questions")
    assert len(list_response.json()) == 1


def test_reimport_by_external_id_updates_instead_of_duplicating(
    admin_client: TestClient,
) -> None:
    admin_client.post(
        "/v1/questions/import",
        json={"allow_new_tags": True, "questions": [_single_payload(prompt="First wording")]},
    )
    response = admin_client.post(
        "/v1/questions/import",
        json={"allow_new_tags": True, "questions": [_single_payload(prompt="Second wording")]},
    )
    assert response.status_code == 200
    assert response.json()["updated"] == 1
    assert response.json()["created"] == 0

    list_response = admin_client.get("/v1/questions")
    body = list_response.json()
    assert len(body) == 1
    assert body[0]["prompt"] == "Second wording"


def test_reimport_replaces_tag_set_rather_than_accumulating(admin_client: TestClient) -> None:
    admin_client.post(
        "/v1/questions/import",
        json={"allow_new_tags": True, "questions": [_single_payload(tags=["cardiology"])]},
    )
    admin_client.post(
        "/v1/questions/import",
        json={"allow_new_tags": True, "questions": [_single_payload(tags=["pharmacology"])]},
    )

    question_id = admin_client.get("/v1/questions").json()[0]["id"]
    assert (
        admin_client.get(
            "/v1/questions", params={"tag_id": _tag_id(admin_client, "cardiology")}
        ).json()
        == []
    )
    matching = admin_client.get(
        "/v1/questions", params={"tag_id": _tag_id(admin_client, "pharmacology")}
    ).json()
    assert [q["id"] for q in matching] == [question_id]


def test_import_treats_blank_external_id_as_absent_not_a_collision(
    admin_client: TestClient,
) -> None:
    # Two items both with external_id="" must both create as distinct,
    # never-matched questions rather than colliding on the unique column —
    # "" is normalized to None at the schema layer.
    response = admin_client.post(
        "/v1/questions/import",
        json={
            "allow_new_tags": False,
            "questions": [
                _single_payload(external_id="", prompt="First"),
                _single_payload(external_id="", prompt="Second"),
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 2
    assert body["errors"] == []

    prompts = {q["prompt"] for q in admin_client.get("/v1/questions").json()}
    assert prompts == {"First", "Second"}


def test_import_does_not_create_orphan_tags_for_a_skipped_item(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/v1/questions/import",
        json={
            "allow_new_tags": True,
            "questions": [
                _single_payload(external_id="bad", tags=["newtag"], correct_option_ids=[])
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["skipped"] == 1

    # The invalid item's tag must not have been left behind as an orphan.
    assert admin_client.get("/v1/tags").json() == []


def test_import_rejects_more_than_max_questions(admin_client: TestClient) -> None:
    questions = [_single_payload(external_id=f"q{i}") for i in range(501)]
    response = admin_client.post(
        "/v1/questions/import", json={"allow_new_tags": True, "questions": questions}
    )
    assert response.status_code == 400


def test_import_reports_errors_by_index_without_failing_the_batch(
    admin_client: TestClient,
) -> None:
    response = admin_client.post(
        "/v1/questions/import",
        json={
            "allow_new_tags": True,
            "questions": [
                _single_payload(external_id="good"),
                _single_payload(external_id="bad", correct_option_ids=[]),
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["skipped"] == 1
    assert body["errors"] == [
        {
            "index": 1,
            "field": "correct_option_ids",
            "message": "correct_option_ids must not be empty",
        }
    ]


def _tag_id(admin_client: TestClient, slug: str) -> str:
    tags = admin_client.get("/v1/tags").json()
    return next(t["id"] for t in tags if t["slug"] == slug)


# --- scoring registry ---------------------------------------------------


def test_single_4_scores_4_or_0_never_partial() -> None:
    from app.questions.scoring import get_scheme

    scheme = get_scheme("single_4")
    all_options = frozenset({"a", "b"})
    assert scheme.grade(frozenset({"a"}), frozenset({"a"}), all_options) == 4
    assert scheme.grade(frozenset({"b"}), frozenset({"a"}), all_options) == 0


@pytest.mark.parametrize(
    ("selected", "expected_points"),
    [
        (frozenset({"a", "c"}), 5),
        (frozenset({"a", "b", "c"}), 4),
        (frozenset({"a", "c", "d"}), 4),
        (frozenset({"a", "b"}), 3),
        (frozenset({"b", "d"}), 1),
        (frozenset({"a", "b", "c", "d", "e"}), 0),
        (frozenset({"a"}), 0),
        (frozenset(), 0),
    ],
)
def test_multi_5_per_option_worked_table(selected: frozenset[str], expected_points: int) -> None:
    from app.questions.scoring import get_scheme

    scheme = get_scheme("multi_5_per_option")
    all_options = frozenset({"a", "b", "c", "d", "e"})
    correct_key = frozenset({"a", "c"})
    assert scheme.grade(selected, correct_key, all_options) == expected_points
