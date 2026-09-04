import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.errors import ApiError
from app.documents.constants import ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES
from app.documents.extraction import ExtractionError, extract_pdf
from app.documents.models import Document, DocumentVersion
from app.documents.schemas import DocumentCreateRequest, UploadUrlRequest
from app.documents.storage import create_signed_upload_url, download_object


def create_upload_url(data: UploadUrlRequest) -> tuple[str, str]:
    if data.mime_type not in ALLOWED_MIME_TYPES:
        raise ApiError(422, "unsupported_media_type", "Only PDF uploads are supported")
    if data.size_bytes > MAX_UPLOAD_BYTES:
        raise ApiError(422, "file_too_large", "File exceeds the 50MB upload limit")

    storage_path = f"{uuid.uuid4()}.pdf"
    token = create_signed_upload_url(storage_path)
    return storage_path, token


def register_document(db: Session, created_by: uuid.UUID, data: DocumentCreateRequest) -> Document:
    if data.mime_type not in ALLOWED_MIME_TYPES:
        raise ApiError(422, "unsupported_media_type", "Only PDF uploads are supported")
    if data.size_bytes > MAX_UPLOAD_BYTES:
        raise ApiError(422, "file_too_large", "File exceeds the 50MB upload limit")

    document = Document(title=data.title, created_by=created_by)
    db.add(document)
    db.flush()

    version = DocumentVersion(
        document_id=document.id,
        storage_path=data.storage_path,
        mime_type=data.mime_type,
        size_bytes=data.size_bytes,
        checksum=data.checksum,
        status="processing",
    )
    db.add(version)
    db.flush()

    document.current_version_id = version.id
    db.commit()

    _process_version(db, version)

    db.commit()
    db.refresh(document)
    return document


def _process_version(db: Session, version: DocumentVersion) -> None:
    try:
        pdf_bytes = download_object(version.storage_path)
        actual_checksum = hashlib.sha256(pdf_bytes).hexdigest()
        if actual_checksum != version.checksum:
            raise ExtractionError("Checksum mismatch — upload may be corrupted")

        blocks = extract_pdf(pdf_bytes)
        version.status = "ready"
        version.extracted_content = {"blocks": blocks}
    except ExtractionError as exc:
        version.status = "failed"
        version.error_message = str(exc)
    except Exception as exc:  # any extraction failure should land as "failed", not a 500
        version.status = "failed"
        version.error_message = f"Unexpected error during processing: {exc}"


def list_documents(db: Session) -> list[Document]:
    return list(db.scalars(select(Document).order_by(Document.created_at.desc())))


def get_document(db: Session, document_id: uuid.UUID) -> Document | None:
    return db.get(Document, document_id)
