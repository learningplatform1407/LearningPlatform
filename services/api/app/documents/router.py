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
    DocumentVersionResponse,
    FlashcardResponse,
    NoteResponse,
    NoteUpsertRequest,
    QuizResponse,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.documents.service import (
    create_upload_url,
    get_document,
    get_note,
    get_sub_chapter_summary,
    list_documents,
    list_flashcards,
    list_quizzes,
    record_lesson_view,
    register_document,
    upsert_note,
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


@router.get("/{document_id}/notes", response_model=NoteResponse | None)
def read_note(
    document_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NoteResponse | None:
    note = get_note(db, user.id, document_id)
    if note is None:
        return None
    return NoteResponse.model_validate(note)


@router.put("/{document_id}/notes", response_model=NoteResponse)
def put_note(
    document_id: UUID,
    data: NoteUpsertRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NoteResponse:
    get_or_create_profile(db, user)
    return upsert_note(db, user.id, document_id, data.content)


@router.get("/{document_id}/quizzes", response_model=list[QuizResponse])
def read_quizzes(
    document_id: UUID,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuizResponse]:
    return [QuizResponse.model_validate(quiz) for quiz in list_quizzes(db, document_id)]


@router.get("/{document_id}/flashcards", response_model=list[FlashcardResponse])
def read_flashcards(
    document_id: UUID,
    _user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FlashcardResponse]:
    return [
        FlashcardResponse.model_validate(flashcard)
        for flashcard in list_flashcards(db, document_id)
    ]
