import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LessonPageInk(Base):
    """One user's freehand ink on one page of a lesson's `LecturePdf`.

    `strokes` holds the full `Stroke[]` array as JSON (and `highlights` the
    page's word highlights), the same convention
    `NotebookEntry.strokes` already uses -- a PUT replaces the whole array,
    there's no per-stroke row. `page_number` is just an integer the client
    supplies: pdf.js (web) and react-native-pdf (mobile) each own their own
    page indexing/rendering, so the backend tracks no page metadata at all.
    """

    __tablename__ = "lesson_page_ink"
    __table_args__ = (
        UniqueConstraint(
            "lecture_pdf_id", "page_number", "user_id", name="uq_lesson_page_ink_pdf_page_user"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_pdf_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lecture_pdfs.id", ondelete="CASCADE")
    )
    page_number: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    strokes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # Word-level highlights made on the PDF page (web only: they need pdf.js's
    # text layer to find words). Stored as rectangles normalised to the page,
    # like stroke points, so they render on any client and survive a pdf.js
    # upgrade that re-segments the text. Same lifecycle as `strokes`: per user,
    # per page, wiped with the rest of the row when the PDF is replaced.
    highlights: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
