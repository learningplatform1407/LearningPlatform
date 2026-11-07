import uuid
from functools import lru_cache

import pymupdf
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.documents.models import LecturePdf
from app.documents.storage import download_object
from app.ink.models import LessonPageInk
from app.ink.schemas import PageHighlight, PageWord
from app.notebook.schemas import Stroke
from app.users.service import get_or_create_profile


def _get_lecture_pdf(db: Session, document_id: uuid.UUID) -> LecturePdf:
    lecture_pdf = db.scalar(select(LecturePdf).where(LecturePdf.document_id == document_id))
    if lecture_pdf is None:
        raise ApiError(404, "not_found", "This lesson has no lecture PDF")
    return lecture_pdf


def get_ink(
    db: Session, document_id: uuid.UUID, page_number: int, user_id: uuid.UUID
) -> tuple[list[Stroke], list[PageHighlight]]:
    lecture_pdf = _get_lecture_pdf(db, document_id)
    ink = db.scalar(
        select(LessonPageInk).where(
            LessonPageInk.lecture_pdf_id == lecture_pdf.id,
            LessonPageInk.page_number == page_number,
            LessonPageInk.user_id == user_id,
        )
    )
    if ink is None:
        return [], []
    return (
        [Stroke.model_validate(stroke) for stroke in ink.strokes],
        [PageHighlight.model_validate(h) for h in ink.highlights or []],
    )


def upsert_ink(
    db: Session,
    document_id: uuid.UUID,
    page_number: int,
    user: AuthenticatedUser,
    strokes: list[Stroke],
    highlights: list[PageHighlight] | None = None,
) -> tuple[list[Stroke], list[PageHighlight]]:
    """Replaces the page's strokes, and its highlights when given -- `None`
    leaves the stored highlights untouched (see LessonPageInkUpdateRequest)."""
    lecture_pdf = _get_lecture_pdf(db, document_id)
    # Bounded only on write. The router already rejects page_number < 1, so
    # this is the half that keeps a client from creating a row per integer it
    # feels like; a read of an out-of-range page just returns [] and costs
    # nothing. Deliberately asymmetric: pymupdf counted this page_count and
    # pdf.js/react-native-pdf count their own, and if the two ever disagreed
    # on a real document, refusing the *read* would blank a page the user can
    # see, whereas refusing the write only fails the save.
    if page_number > lecture_pdf.page_count:
        raise ApiError(
            422,
            "page_out_of_range",
            f"This lecture PDF has {lecture_pdf.page_count} pages",
        )
    # A profile row must exist before we can FK ink to it -- same ordering
    # concern app/annotations/service.py::create_annotation already guards
    # against (a user could reach this endpoint before ever calling GET
    # /v1/me, which is what normally creates the profile row).
    profile = get_or_create_profile(db, user)
    ink = db.scalar(
        select(LessonPageInk).where(
            LessonPageInk.lecture_pdf_id == lecture_pdf.id,
            LessonPageInk.page_number == page_number,
            LessonPageInk.user_id == profile.id,
        )
    )
    strokes_data = [stroke.model_dump() for stroke in strokes]
    if ink is None:
        ink = LessonPageInk(
            lecture_pdf_id=lecture_pdf.id,
            page_number=page_number,
            user_id=profile.id,
            strokes=strokes_data,
            highlights=[],
        )
        db.add(ink)
    else:
        ink.strokes = strokes_data
    if highlights is not None:
        ink.highlights = [h.model_dump(mode="json") for h in highlights]
    db.commit()
    return strokes, [PageHighlight.model_validate(h) for h in ink.highlights]


# A lecture PDF never changes under its storage path (a replacement is
# uploaded under a new one), so its bytes can be kept between the page-by-page
# word requests of one reading session instead of downloaded for each page.
@lru_cache(maxsize=4)
def _lecture_pdf_bytes(storage_path: str) -> bytes:
    return download_object(storage_path)


def get_page_words(db: Session, document_id: uuid.UUID, page_number: int) -> list[PageWord]:
    """The words on one page of the lesson's lecture PDF, with boxes in page
    units -- what the mobile app marks highlights against, since its native
    PDF view exposes no text (the web reads the same from pdf.js). A page
    past the end is empty, for the same reason a read of its ink is."""
    lecture_pdf = _get_lecture_pdf(db, document_id)
    if page_number > lecture_pdf.page_count:
        return []
    with pymupdf.open(stream=_lecture_pdf_bytes(lecture_pdf.storage_path), filetype="pdf") as doc:
        if page_number > doc.page_count:
            return []
        page = doc[page_number - 1]
        # Word boxes come in the unrotated page's space; the rotation matrix
        # turns them into the page as displayed, which `page.rect` measures.
        width, height = page.rect.width, page.rect.height
        words: list[PageWord] = []
        for x0, y0, x1, y1, text, block, line, _ in page.get_text("words", sort=True):
            box = pymupdf.Rect(x0, y0, x1, y1) * page.rotation_matrix
            words.append(
                PageWord(
                    text=text,
                    box=(
                        min(max(box.x0 / width, 0.0), 1.0),
                        min(max(box.y0 / height, 0.0), 1.0),
                        min(max(box.x1 / width, 0.0), 1.0),
                        min(max(box.y1 / height, 0.0), 1.0),
                    ),
                    line=block * 1000 + line,
                )
            )
        return words
