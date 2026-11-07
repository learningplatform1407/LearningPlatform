import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.documents.models import Document, LecturePdf
from app.ink.models import LessonPageInk
from app.main import app
from app.users.models import AccountSettings, Profile


@pytest.fixture
def owner_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="owner@example.com")


@pytest.fixture
def other_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="other@example.com")


@pytest.fixture
def lesson_with_pdf(db_session: Session, owner_user: AuthenticatedUser) -> uuid.UUID:
    db_session.add(Profile(id=owner_user.id, settings=AccountSettings(user_id=owner_user.id)))
    db_session.flush()

    document = Document(title="Test Lecture", created_by=owner_user.id)
    db_session.add(document)
    db_session.flush()

    lecture_pdf = LecturePdf(
        document_id=document.id,
        storage_path="book.pdf",
        mime_type="application/pdf",
        size_bytes=10,
        checksum="abc",
        status="ready",
        # Explicit, because page_number is now bounded by it on write: left
        # to the column's server_default of 1, every test touching page 2+
        # would get a 422.
        page_count=5,
    )
    db_session.add(lecture_pdf)
    db_session.commit()
    return document.id


@pytest.fixture
def lesson_without_pdf(db_session: Session, owner_user: AuthenticatedUser) -> uuid.UUID:
    db_session.merge(Profile(id=owner_user.id, settings=AccountSettings(user_id=owner_user.id)))
    db_session.flush()
    document = Document(title="No PDF Lecture", created_by=owner_user.id)
    db_session.add(document)
    db_session.commit()
    return document.id


def _stroke() -> dict:
    # pressure round-trips through StrokePoint as an explicit None when
    # omitted, not an absent key -- include it so the response comparison
    # is exact.
    return {
        "color": "#1f2937",
        "width": 0.006,
        "points": [
            {"x": 0.1, "y": 0.2, "pressure": None},
            {"x": 0.3, "y": 0.4, "pressure": 0.5},
        ],
    }


def test_ink_requires_auth(client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    response = client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert response.status_code == 401


@pytest.mark.parametrize("page_number", [0, -1])
def test_ink_rejects_a_page_below_one(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID, page_number: int
) -> None:
    """Pages are 1-based on both clients, so 0 and negatives are nonsense.

    Unbounded, `page_number` was any integer the client cared to send, each
    one eligible for its own row.
    """
    url = f"/v1/documents/{lesson_with_pdf}/pages/{page_number}/ink"
    assert authed_client.get(url).status_code == 422
    assert authed_client.put(url, json={"strokes": [_stroke()]}).status_code == 422


def test_put_ink_rejects_a_page_past_the_pdfs_page_count(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID, db_session: Session
) -> None:
    url = f"/v1/documents/{lesson_with_pdf}/pages/6/ink"  # fixture PDF has 5
    response = authed_client.put(url, json={"strokes": [_stroke()]})

    assert response.status_code == 422
    assert response.json()["code"] == "page_out_of_range"
    assert db_session.query(LessonPageInk).count() == 0

    # The last real page still works, i.e. the bound is inclusive.
    last_page = authed_client.put(
        f"/v1/documents/{lesson_with_pdf}/pages/5/ink", json={"strokes": [_stroke()]}
    )
    assert last_page.status_code == 200


def test_get_ink_past_the_page_count_is_empty_rather_than_an_error(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID
) -> None:
    """Reads are deliberately not bounded -- see upsert_ink's comment.

    pymupdf counted `page_count` server-side and pdf.js/react-native-pdf
    count their own; if the two ever disagreed on a real document, failing
    the read would blank a page the user can see, while failing the write
    only refuses the save.
    """
    response = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/99/ink")
    assert response.status_code == 200
    assert response.json() == {"strokes": [], "highlights": []}


def test_get_ink_defaults_to_empty(authed_client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    response = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert response.status_code == 200
    assert response.json() == {"strokes": [], "highlights": []}


def test_put_ink_replaces_full_array(authed_client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    response = authed_client.put(
        f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": [_stroke()]}
    )
    assert response.status_code == 200
    assert response.json()["strokes"] == [_stroke()]

    # A second PUT with fewer strokes fully replaces, it doesn't append.
    response = authed_client.put(
        f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": []}
    )
    assert response.status_code == 200
    assert response.json()["strokes"] == []

    get_response = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert get_response.json()["strokes"] == []


def test_ink_is_scoped_per_user(
    client: TestClient,
    lesson_with_pdf: uuid.UUID,
    owner_user: AuthenticatedUser,
    other_user: AuthenticatedUser,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: owner_user
    put_response = client.put(
        f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": [_stroke()]}
    )
    assert put_response.status_code == 200

    app.dependency_overrides[get_current_user] = lambda: other_user
    other_get = client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/ink")
    assert other_get.json()["strokes"] == []

    app.dependency_overrides.pop(get_current_user, None)


def test_ink_is_scoped_per_page(authed_client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    authed_client.put(f"/v1/documents/{lesson_with_pdf}/pages/1/ink", json={"strokes": [_stroke()]})
    page_two = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/2/ink")
    assert page_two.json()["strokes"] == []


def test_ink_404s_when_lesson_has_no_lecture_pdf(
    authed_client: TestClient, lesson_without_pdf: uuid.UUID
) -> None:
    get_response = authed_client.get(f"/v1/documents/{lesson_without_pdf}/pages/1/ink")
    assert get_response.status_code == 404

    put_response = authed_client.put(
        f"/v1/documents/{lesson_without_pdf}/pages/1/ink", json={"strokes": []}
    )
    assert put_response.status_code == 404


def _highlight(color: str = "yellow") -> dict[str, object]:
    return {"color": color, "rects": [[0.1, 0.2, 0.4, 0.23]]}


def test_highlights_round_trip(authed_client: TestClient, lesson_with_pdf: uuid.UUID) -> None:
    url = f"/v1/documents/{lesson_with_pdf}/pages/2/ink"
    response = authed_client.put(url, json={"strokes": [], "highlights": [_highlight("blue")]})
    assert response.status_code == 200
    assert response.json()["highlights"] == [_highlight("blue")]
    assert authed_client.get(url).json()["highlights"] == [_highlight("blue")]


def test_a_strokes_only_save_keeps_existing_highlights(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID
) -> None:
    """Mobile can't highlight a PDF and only ever sends strokes. Its saves
    must not wipe highlights made on the web."""
    url = f"/v1/documents/{lesson_with_pdf}/pages/1/ink"
    authed_client.put(url, json={"strokes": [], "highlights": [_highlight()]})

    response = authed_client.put(url, json={"strokes": [_stroke()]})

    assert response.json() == {"strokes": [_stroke()], "highlights": [_highlight()]}


def test_an_empty_highlights_list_clears_them(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID
) -> None:
    url = f"/v1/documents/{lesson_with_pdf}/pages/1/ink"
    authed_client.put(url, json={"strokes": [], "highlights": [_highlight()]})

    response = authed_client.put(url, json={"strokes": [], "highlights": []})

    assert response.json()["highlights"] == []


@pytest.mark.parametrize(
    "rects",
    [[[0.1, 0.2, 1.4, 0.3]], [[-0.1, 0.2, 0.4, 0.3]], [[0.1, 0.2, 0.3]], []],
)
def test_highlight_rects_must_be_on_the_page(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID, rects: list[list[float]]
) -> None:
    url = f"/v1/documents/{lesson_with_pdf}/pages/1/ink"
    response = authed_client.put(
        url, json={"strokes": [], "highlights": [{"color": "yellow", "rects": rects}]}
    )
    assert response.status_code == 422


def _two_line_pdf() -> bytes:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=200, height=100)
    page.insert_text((20, 30), "Hello world", fontsize=12)
    page.insert_text((20, 60), "Second line", fontsize=12)
    return doc.tobytes()


def test_page_words_come_with_boxes_in_page_units(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID
) -> None:
    from app.ink import service

    service._lecture_pdf_bytes.cache_clear()
    with patch("app.ink.service.download_object", return_value=_two_line_pdf()):
        response = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/1/words")

    assert response.status_code == 200
    words = response.json()["words"]
    assert [w["text"] for w in words] == ["Hello", "world", "Second", "line"]
    assert all(0 <= v <= 1 for w in words for v in w["box"])
    hello, world, second, _ = words
    # Same printed line, left to right; the next line starts lower down.
    assert hello["line"] == world["line"] != second["line"]
    assert hello["box"][0] < world["box"][0]
    assert second["box"][1] > hello["box"][3]
    # 20pt in on a 200pt page.
    assert hello["box"][0] == pytest.approx(0.1, abs=0.01)


def test_page_words_past_the_page_count_are_empty(
    authed_client: TestClient, lesson_with_pdf: uuid.UUID
) -> None:
    response = authed_client.get(f"/v1/documents/{lesson_with_pdf}/pages/6/words")
    assert response.status_code == 200
    assert response.json() == {"words": []}


def test_page_words_404_without_a_lecture_pdf(
    authed_client: TestClient, lesson_without_pdf: uuid.UUID
) -> None:
    response = authed_client.get(f"/v1/documents/{lesson_without_pdf}/pages/1/words")
    assert response.status_code == 404
