from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.cloze.service import ensure_cloze_cards
from app.common.errors import ApiError
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.documents.models import Document, LecturePdf
from app.documents.schemas import (
    DocumentCreateRequest,
    DocumentResponse,
    DocumentSummaryResponse,
    DocumentVersionResponse,
    LecturePdfResponse,
    ReplaceLectureTextRequest,
    UploadUrlRequest,
    UploadUrlResponse,
    UpsertLecturePdfRequest,
)
from app.documents.service import (
    create_upload_url,
    get_document,
    get_sub_chapter_summary,
    list_documents,
    record_lesson_view,
    register_document,
    replace_lecture_text,
    upsert_lecture_pdf,
)
from app.users.service import get_or_create_profile

router = APIRouter(prefix="/v1/documents", tags=["documents"])


def _to_summary(document: Document) -> DocumentSummaryResponse:
    return DocumentSummaryResponse(
        id=document.id,
        title=document.title,
        created_at=document.created_at,
        status=document.current_version.status if document.current_version else None,
    )


def _to_document_response(db: Session, document: Document) -> DocumentResponse:
    lecture_pdf = db.scalar(select(LecturePdf).where(LecturePdf.document_id == document.id))
    return DocumentResponse(
        id=document.id,
        title=document.title,
        created_by=document.created_by,
        created_at=document.created_at,
        updated_at=document.updated_at,
        current_version=DocumentVersionResponse.model_validate(document.current_version)
        if document.current_version
        else None,
        sub_chapter=get_sub_chapter_summary(db, document.sub_chapter_id),
        lecture_pdf=LecturePdfResponse.model_validate(lecture_pdf) if lecture_pdf else None,
    )


@router.post("/upload-url", response_model=UploadUrlResponse)
def request_upload_url(
    data: UploadUrlRequest,
    _admin: AuthenticatedUser = Depends(require_admin),
) -> UploadUrlResponse:
    storage_path, token = create_upload_url(data)
    return UploadUrlResponse(storage_path=storage_path, token=token)


@router.post("", response_model=DocumentResponse)
def create_document(
    data: DocumentCreateRequest,
    admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    document = register_document(db, admin.id, data)
    # Cross-domain orchestration lives at the router layer, not inside
    # documents/service.py, to avoid a documents.service <-> cloze.service
    # import cycle (cloze.service also needs documents.service, for the
    # review-summary aggregation).
    ensure_cloze_cards(db, document)
    return _to_document_response(db, document)


@router.get("", response_model=list[DocumentSummaryResponse])
def read_documents(
    sub_chapter_id: str | None = None,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentSummaryResponse]:
    if sub_chapter_id is None:
        documents = list_documents(db)
    elif sub_chapter_id == "none":
        documents = list_documents(db, sub_chapter_id=None, filter_by_sub_chapter=True)
    else:
        try:
            parsed_sub_chapter_id = UUID(sub_chapter_id)
        except ValueError as exc:
            raise ApiError(
                422, "invalid_sub_chapter_id", "sub_chapter_id must be a UUID or 'none'"
            ) from exc
        documents = list_documents(
            db, sub_chapter_id=parsed_sub_chapter_id, filter_by_sub_chapter=True
        )
    return [_to_summary(document) for document in documents]


@router.get("/{document_id}", response_model=DocumentResponse)
def read_document(
    document_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    document = get_document(db, document_id)
    if document is None:
        raise ApiError(404, "not_found", "Document not found")
    get_or_create_profile(db, user)
    record_lesson_view(db, user.id, document_id)
    return _to_document_response(db, document)


@router.post("/{document_id}/replace", response_model=DocumentResponse)
def replace_lecture_text_route(
    document_id: UUID,
    data: ReplaceLectureTextRequest,
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    # Deliberately no ensure_cloze_cards call here, unlike create_document --
    # flashcards/cloze cards/question-bank questions stay keyed on
    # document_id alone and are left untouched by a lecture-text replace.
    document = replace_lecture_text(db, document_id, data)
    return _to_document_response(db, document)


@router.put("/{document_id}/pdf", response_model=LecturePdfResponse)
def upsert_lecture_pdf_route(
    document_id: UUID,
    data: UpsertLecturePdfRequest,
    _admin: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> LecturePdfResponse:
    lecture_pdf = upsert_lecture_pdf(db, document_id, data)
    return LecturePdfResponse.model_validate(lecture_pdf)


# GET /{document_id}/flashcards now lives in app/flashcards/router.py, which
# serves the same path with scope filtering and real visibility rules. The
# /quizzes route is gone with the `quizzes` table -- a lesson's questions are
# reached through the question bank (questions.document_id).
