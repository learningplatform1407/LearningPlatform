from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.db.session import get_db
from app.documents.dependencies import require_admin
from app.documents.models import Document
from app.documents.schemas import (
    DocumentCreateRequest,
    DocumentResponse,
    DocumentSummaryResponse,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.documents.service import (
    create_upload_url,
    get_document,
    list_documents,
    record_lesson_view,
    register_document,
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
    return DocumentResponse.model_validate(document)


@router.get("", response_model=list[DocumentSummaryResponse])
def read_documents(
    chapter_id: str | None = None,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentSummaryResponse]:
    if chapter_id is None:
        documents = list_documents(db)
    elif chapter_id == "none":
        documents = list_documents(db, chapter_id=None, filter_by_chapter=True)
    else:
        try:
            parsed_chapter_id = UUID(chapter_id)
        except ValueError as exc:
            raise ApiError(
                422, "invalid_chapter_id", "chapter_id must be a UUID or 'none'"
            ) from exc
        documents = list_documents(db, chapter_id=parsed_chapter_id, filter_by_chapter=True)
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
    return DocumentResponse.model_validate(document)
