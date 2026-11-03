import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    sub_chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sub_chapters.id", ondelete="SET NULL"), default=None
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("document_versions.id", ondelete="SET NULL", use_alter=True), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list["DocumentVersion"]] = relationship(
        back_populates="document",
        foreign_keys="DocumentVersion.document_id",
        cascade="all, delete-orphan",
    )
    current_version: Mapped["DocumentVersion | None"] = relationship(
        foreign_keys=[current_version_id], post_update=True, viewonly=True
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    storage_path: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String)
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="processing")
    error_message: Mapped[str | None] = mapped_column(String, default=None)
    extracted_content: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped["Document"] = relationship(
        back_populates="versions", foreign_keys=[document_id]
    )


class LecturePdf(Base):
    """The lesson's reference-book PDF, rendered client-side (pdf.js on web,
    react-native-pdf on mobile) and drawn on directly -- unlike
    `DocumentVersion`, which holds the admin-authored lecture text that
    `extract_pdf` turns into blocks. One per document (enforced by the
    unique FK): attaching or replacing it is a full wipe-and-recreate, never
    a partial update -- see app/documents/service.py::upsert_lecture_pdf.
    No `extracted_content` here; this artifact is never text-extracted."""

    __tablename__ = "lecture_pdfs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), unique=True
    )
    storage_path: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String)
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum: Mapped[str] = mapped_column(String)
    # Counted by `validate_pdf` at upload -- the only page metadata stored.
    # It bounds which `page_number` may carry ink (without it any integer
    # could, negatives and 2^31 included) and lets a client label "page 1 of
    # N" before the PDF has finished downloading. Page rendering and page
    # indexing still belong entirely to the clients.
    page_count: Mapped[int] = mapped_column(Integer, server_default="1")
    status: Mapped[str] = mapped_column(String, default="processing")
    error_message: Mapped[str | None] = mapped_column(String, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LessonView(Base):
    """Tracks the last time a user opened a lesson (document) — one row per
    (user, document), upserted on each view. Powers "continue where you left
    off" (the single most-recent row) and "recently opened" (the next few)."""

    __tablename__ = "lesson_views"
    __table_args__ = (
        UniqueConstraint("user_id", "document_id", name="uq_lesson_views_user_document"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    last_viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# Quiz lived here as a shell record linking a lesson to a "quiz" that never
# gained a question schema. Superseded by the question bank and quiz sessions
# (app/questions, app/quizzes), which scope questions to a lesson through
# questions.document_id instead. Flashcard also lived here, and now owns a
# real feature in app/flashcards.
