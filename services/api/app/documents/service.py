import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.chapters.models import Chapter
from app.common.errors import ApiError
from app.documents.constants import ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES
from app.documents.extraction import ExtractedBlock, ExtractionError, extract_pdf
from app.documents.models import Document, DocumentVersion, Flashcard, LessonNote, LessonView, Quiz
from app.documents.schemas import (
    ChapterSummary,
    DocumentCreateRequest,
    NoteResponse,
    SubChapterSummary,
    UploadUrlRequest,
)
from app.documents.storage import create_signed_upload_url, download_object, upload_object
from app.sub_chapters.models import SubChapter


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

    order_index = (
        db.scalar(
            select(func.count())
            .select_from(Document)
            .where(Document.sub_chapter_id == data.sub_chapter_id)
        )
        or 0
    )
    document = Document(
        title=data.title,
        created_by=created_by,
        sub_chapter_id=data.sub_chapter_id,
        order_index=order_index,
    )
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

        raw_blocks = extract_pdf(pdf_bytes)
        blocks = _persist_images(version.id, raw_blocks)
        version.status = "ready"
        version.extracted_content = {"blocks": blocks}
    except ExtractionError as exc:
        version.status = "failed"
        version.error_message = str(exc)
    except Exception as exc:  # any extraction failure should land as "failed", not a 500
        version.status = "failed"
        version.error_message = f"Unexpected error during processing: {exc}"


def _persist_images(
    version_id: uuid.UUID, raw_blocks: list[ExtractedBlock]
) -> list[dict[str, Any]]:
    """Uploads each image block's raw bytes to Storage, replacing them with a
    path — extracted_content is stored as JSON, so raw bytes never land in
    the database, only the path to fetch them from later."""
    blocks: list[dict[str, Any]] = []
    image_index = 0
    for block in raw_blocks:
        if block["type"] != "image":
            blocks.append({"type": block["type"], "text": block["text"], "page": block["page"]})
            continue

        image_index += 1
        ext = block["ext"]
        image_path = f"{version_id}/images/{image_index}.{ext}"
        upload_object(image_path, block["image_bytes"], f"image/{ext}")
        blocks.append({"type": "image", "page": block["page"], "image_path": image_path})
    return blocks


def list_documents(
    db: Session, sub_chapter_id: uuid.UUID | None = None, filter_by_sub_chapter: bool = False
) -> list[Document]:
    """With `filter_by_sub_chapter=False` (default) returns every document,
    unscoped. With `filter_by_sub_chapter=True`, `sub_chapter_id=None` filters
    to the Uncategorized bucket (`sub_chapter_id IS NULL`) and a real UUID
    filters to that sub-chapter."""
    query = select(Document).order_by(Document.order_index, Document.created_at.desc())
    if filter_by_sub_chapter:
        query = query.where(Document.sub_chapter_id == sub_chapter_id)
    return list(db.scalars(query))


def get_document(db: Session, document_id: uuid.UUID) -> Document | None:
    return db.get(Document, document_id)


def get_sub_chapter_summary(
    db: Session, sub_chapter_id: uuid.UUID | None
) -> SubChapterSummary | None:
    if sub_chapter_id is None:
        return None
    sub_chapter = db.get(SubChapter, sub_chapter_id)
    if sub_chapter is None:
        return None
    chapter = db.get(Chapter, sub_chapter.chapter_id)
    if chapter is None:
        return None
    return SubChapterSummary(
        id=sub_chapter.id,
        title=sub_chapter.title,
        chapter=ChapterSummary(id=chapter.id, title=chapter.title),
    )


def record_lesson_view(db: Session, user_id: uuid.UUID, document_id: uuid.UUID) -> None:
    # Timestamped in Python (not via the DB's func.now()) for microsecond
    # precision — SQLite's CURRENT_TIMESTAMP is second-granularity, so two
    # views in quick succession could otherwise tie and order arbitrarily.
    now = datetime.now(UTC)
    existing = db.scalar(
        select(LessonView).where(
            LessonView.user_id == user_id, LessonView.document_id == document_id
        )
    )
    if existing is None:
        db.add(LessonView(user_id=user_id, document_id=document_id, last_viewed_at=now))
    else:
        db.execute(
            update(LessonView).where(LessonView.id == existing.id).values(last_viewed_at=now)
        )
    db.commit()


def list_recent_lessons(
    db: Session, user_id: uuid.UUID, limit: int
) -> list[tuple[Document, datetime]]:
    rows = db.execute(
        select(Document, LessonView.last_viewed_at)
        .join(LessonView, LessonView.document_id == Document.id)
        .where(LessonView.user_id == user_id)
        .order_by(LessonView.last_viewed_at.desc())
        .limit(limit)
    ).all()
    return [(document, last_viewed_at) for document, last_viewed_at in rows]


def get_note(db: Session, user_id: uuid.UUID, document_id: uuid.UUID) -> LessonNote | None:
    return db.scalar(
        select(LessonNote).where(
            LessonNote.user_id == user_id, LessonNote.document_id == document_id
        )
    )


def upsert_note(
    db: Session, user_id: uuid.UUID, document_id: uuid.UUID, content: str
) -> NoteResponse:
    now = datetime.now(UTC)
    existing = get_note(db, user_id, document_id)
    if existing is None:
        note = LessonNote(user_id=user_id, document_id=document_id, content=content, updated_at=now)
        db.add(note)
    else:
        db.execute(
            update(LessonNote)
            .where(LessonNote.id == existing.id)
            .values(content=content, updated_at=now)
        )
    db.commit()
    return NoteResponse(document_id=document_id, content=content, updated_at=now)


def list_quizzes(db: Session, document_id: uuid.UUID) -> list[Quiz]:
    return list(
        db.scalars(
            select(Quiz).where(Quiz.document_id == document_id).order_by(Quiz.created_at)
        )
    )


def list_flashcards(db: Session, document_id: uuid.UUID) -> list[Flashcard]:
    return list(
        db.scalars(
            select(Flashcard)
            .where(Flashcard.document_id == document_id)
            .order_by(Flashcard.order_index)
        )
    )
