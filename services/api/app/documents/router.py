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
from app.documents.service import create_upload_url, get_document, list_documents, register_document

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
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentSummaryResponse]:
    return [_to_summary(document) for document in list_documents(db)]


@router.get("/{document_id}", response_model=DocumentResponse)
def read_document(
    document_id: UUID,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    document = get_document(db, document_id)
    if document is None:
        raise ApiError(404, "not_found", "Document not found")
    return DocumentResponse.model_validate(document)
