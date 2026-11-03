import hashlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.annotations.models import DocumentAnnotation
from app.chapters.models import Chapter
from app.common.errors import ApiError
from app.documents.constants import ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES
from app.documents.diffing import match_blocks_by_text
from app.documents.extraction import ExtractedBlock, ExtractionError, extract_pdf, validate_pdf
from app.documents.models import Document, DocumentVersion, LecturePdf, LessonView
from app.documents.schemas import (
    ChapterSummary,
    DocumentCreateRequest,
    ReplaceLectureTextRequest,
    SubChapterSummary,
    UploadUrlRequest,
    UpsertLecturePdfRequest,
)
from app.documents.storage import (
    create_signed_upload_url,
    delete_object,
    download_object,
    upload_object,
)
from app.sub_chapters.models import SubChapter

logger = logging.getLogger(__name__)


def _discard_object(path: str) -> None:
    """Best-effort Storage delete. Deliberately broad, for the same reason
    app/feed/service.py::_discard_image is: `delete_object` raises
    RuntimeError on misconfiguration and httpx ConnectError/ReadTimeout from
    the transport, none of which subclass StorageError. An earlier
    `suppress(StorageError)` here let all three escape -- and both callers
    run *after* their commit, so an unreachable or unconfigured Storage
    500'd a request whose database work had already succeeded. Enumerating
    failure types means re-deriving httpx's hierarchy correctly forever; the
    contract is simply "never fail the caller".
    """
    try:
        delete_object(path)
    except Exception:
        logger.warning("Failed to delete object %s", path, exc_info=True)


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


def _delete_version_storage(version: DocumentVersion) -> None:
    """Best-effort cleanup of a version's Storage objects (its own PDF plus
    any extracted images) -- failures are non-fatal, same posture as
    `delete_object`'s own docstring: an orphaned object is benign, whereas
    failing a request the database already committed is not."""
    paths = [version.storage_path]
    for block in (version.extracted_content or {}).get("blocks", []):
        if block.get("type") == "image" and block.get("image_path"):
            paths.append(block["image_path"])
    for path in paths:
        _discard_object(path)


def replace_lecture_text(
    db: Session, document_id: uuid.UUID, data: ReplaceLectureTextRequest
) -> Document:
    """Replaces a lesson's admin-authored lecture text (the block-extracted
    content Text mode renders) with a new PDF -- a routine, expected-to-
    happen-often operation, unlike `upsert_lecture_pdf` below.

    Highlights/margin-notes on text blocks whose content didn't change
    survive the replace, even if their position shifted -- everything else
    (changed blocks, anything on an image block, flashcards/cloze cards/
    question-bank questions) is left exactly as the decisions in this
    feature's plan settled: dropped for annotations, untouched entirely for
    flashcards/cloze/questions, which stay keyed on `document_id` alone.
    """
    if data.size_bytes > MAX_UPLOAD_BYTES:
        raise ApiError(422, "file_too_large", "File exceeds the 50MB upload limit")

    document = db.get(Document, document_id)
    if document is None or document.current_version_id is None:
        raise ApiError(404, "not_found", "Document not found")
    old_version = document.current_version
    if old_version is None:  # mirrors current_version_id's own null-check above for mypy
        raise ApiError(404, "not_found", "Document not found")

    new_version = DocumentVersion(
        document_id=document.id,
        storage_path=data.storage_path,
        mime_type=data.mime_type,
        size_bytes=data.size_bytes,
        checksum=data.checksum,
        status="processing",
    )
    db.add(new_version)
    db.flush()

    _process_version(db, new_version)

    if new_version.status != "ready":
        # A bad replace must not touch the old, working content.
        error_message = new_version.error_message
        db.rollback()
        raise ApiError(422, "extraction_failed", error_message or "Could not process the new PDF")

    old_blocks = (old_version.extracted_content or {}).get("blocks", [])
    new_blocks = (new_version.extracted_content or {}).get("blocks", [])
    for old_index, new_index in match_blocks_by_text(old_blocks, new_blocks):
        db.execute(
            update(DocumentAnnotation)
            .where(
                DocumentAnnotation.document_version_id == old_version.id,
                DocumentAnnotation.block_index == old_index,
            )
            .values(document_version_id=new_version.id, block_index=new_index)
        )

    document.current_version_id = new_version.id
    db.commit()

    # Everything left pointing at old_version (annotations on changed/image
    # blocks that weren't reassigned above) cascades away with it.
    _delete_version_storage(old_version)
    db.delete(old_version)
    db.commit()

    db.refresh(document)
    return document


def upsert_lecture_pdf(
    db: Session, document_id: uuid.UUID, data: UpsertLecturePdfRequest
) -> LecturePdf:
    """Attaches or replaces a lesson's lecture PDF (the reference book
    rendered client-side for ink annotation) -- a rare, "new edition of the
    book" event, always a full wipe-and-recreate with no content matching
    at all: replacing it drops every user's ink on this lesson
    unconditionally, by design."""
    if data.size_bytes > MAX_UPLOAD_BYTES:
        raise ApiError(422, "file_too_large", "File exceeds the 50MB upload limit")

    document = db.get(Document, document_id)
    if document is None:
        raise ApiError(404, "not_found", "Document not found")

    existing = db.scalar(select(LecturePdf).where(LecturePdf.document_id == document_id))
    if existing is not None:
        _discard_object(existing.storage_path)
        # This cascades away every user's LessonPageInk for this lesson.
        db.delete(existing)
        db.flush()

    lecture_pdf = LecturePdf(
        document_id=document.id,
        storage_path=data.storage_path,
        mime_type=data.mime_type,
        size_bytes=data.size_bytes,
        checksum=data.checksum,
        status="processing",
    )
    db.add(lecture_pdf)
    db.flush()

    try:
        pdf_bytes = download_object(lecture_pdf.storage_path)
        actual_checksum = hashlib.sha256(pdf_bytes).hexdigest()
        if actual_checksum != lecture_pdf.checksum:
            raise ExtractionError("Checksum mismatch — upload may be corrupted")
        lecture_pdf.page_count = validate_pdf(pdf_bytes)
        lecture_pdf.status = "ready"
    except ExtractionError as exc:
        lecture_pdf.status = "failed"
        lecture_pdf.error_message = str(exc)
    except Exception as exc:  # any validation failure should land as "failed", not a 500
        lecture_pdf.status = "failed"
        lecture_pdf.error_message = f"Unexpected error during processing: {exc}"

    db.commit()
    db.refresh(lecture_pdf)
    return lecture_pdf


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
        chapter=ChapterSummary(id=chapter.id, book_id=chapter.book_id, title=chapter.title),
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
