import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.documents.models import Document


class NotebookEntry(Base):
    """A standalone note, not tied to any lesson — either free text or a
    freehand drawing (stored as vector stroke data, not a rasterized image,
    so it stays resolution-independent). A user can have any number of
    these."""

    __tablename__ = "notebook_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String)
    content: Mapped[str | None] = mapped_column(String, default=None)
    strokes: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)
    # Which lesson (if any) was open when this note was created, via the
    # lesson reader's Notes panel. Not a filter -- the notebook is one pool,
    # browsed whole -- but it is shown, as the note's provenance: "all notes"
    # lists other lessons' notes too, and without this they were
    # indistinguishable from each other. SET NULL on delete, so losing the
    # lesson never loses the note itself (the note then reads as unattached).
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Eager, because every list response reads the title through it: the
    # notebook is listed whole, so a lazy load here is one query per note.
    source_document: Mapped[Document | None] = relationship(
        lazy="joined", viewonly=True, foreign_keys=[source_document_id]
    )

    @property
    def source_document_title(self) -> str | None:
        """The lesson this note was written in, for the response schema to
        read through `from_attributes`. None both for a note written outside
        any lesson and for one whose lesson has since been deleted -- the
        client shows the same "not from a lesson" either way."""
        return self.source_document.title if self.source_document else None
