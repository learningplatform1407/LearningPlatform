import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NotebookEntry(Base):
    """A standalone note, not tied to any lesson — either free text or a
    freehand drawing (stored as vector stroke data, not a rasterized image,
    so it stays resolution-independent). Unlike `LessonNote`, a user can
    have any number of these."""

    __tablename__ = "notebook_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String)
    content: Mapped[str | None] = mapped_column(String, default=None)
    strokes: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
