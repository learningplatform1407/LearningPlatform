import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.documents.models import LecturePdf
from app.ink.models import LessonPageInk
from app.notebook.schemas import Stroke
from app.users.service import get_or_create_profile


def _get_lecture_pdf(db: Session, document_id: uuid.UUID) -> LecturePdf:
    lecture_pdf = db.scalar(select(LecturePdf).where(LecturePdf.document_id == document_id))
    if lecture_pdf is None:
        raise ApiError(404, "not_found", "This lesson has no lecture PDF")
    return lecture_pdf


def get_ink(
    db: Session, document_id: uuid.UUID, page_number: int, user_id: uuid.UUID
) -> list[Stroke]:
    lecture_pdf = _get_lecture_pdf(db, document_id)
    ink = db.scalar(
        select(LessonPageInk).where(
            LessonPageInk.lecture_pdf_id == lecture_pdf.id,
            LessonPageInk.page_number == page_number,
            LessonPageInk.user_id == user_id,
        )
    )
    if ink is None:
        return []
    return [Stroke.model_validate(stroke) for stroke in ink.strokes]


def upsert_ink(
    db: Session,
    document_id: uuid.UUID,
    page_number: int,
    user: AuthenticatedUser,
    strokes: list[Stroke],
) -> list[Stroke]:
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
        )
        db.add(ink)
    else:
        ink.strokes = strokes_data
    db.commit()
    return strokes
