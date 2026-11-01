import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.documents.models import LecturePdf
from app.ink.models import LessonPageInk
from app.notebook.schemas import Stroke
from app.users.service import get_or_create_profile


def _get_lecture_pdf_id(db: Session, document_id: uuid.UUID) -> uuid.UUID:
    lecture_pdf_id = db.scalar(select(LecturePdf.id).where(LecturePdf.document_id == document_id))
    if lecture_pdf_id is None:
        raise ApiError(404, "not_found", "This lesson has no lecture PDF")
    return lecture_pdf_id


def get_ink(
    db: Session, document_id: uuid.UUID, page_number: int, user_id: uuid.UUID
) -> list[Stroke]:
    lecture_pdf_id = _get_lecture_pdf_id(db, document_id)
    ink = db.scalar(
        select(LessonPageInk).where(
            LessonPageInk.lecture_pdf_id == lecture_pdf_id,
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
    lecture_pdf_id = _get_lecture_pdf_id(db, document_id)
    # A profile row must exist before we can FK ink to it -- same ordering
    # concern app/annotations/service.py::create_annotation already guards
    # against (a user could reach this endpoint before ever calling GET
    # /v1/me, which is what normally creates the profile row).
    profile = get_or_create_profile(db, user)
    ink = db.scalar(
        select(LessonPageInk).where(
            LessonPageInk.lecture_pdf_id == lecture_pdf_id,
            LessonPageInk.page_number == page_number,
            LessonPageInk.user_id == profile.id,
        )
    )
    strokes_data = [stroke.model_dump() for stroke in strokes]
    if ink is None:
        ink = LessonPageInk(
            lecture_pdf_id=lecture_pdf_id,
            page_number=page_number,
            user_id=profile.id,
            strokes=strokes_data,
        )
        db.add(ink)
    else:
        ink.strokes = strokes_data
    db.commit()
    return strokes
