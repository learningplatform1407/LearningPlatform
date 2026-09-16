import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.errors import ApiError
from app.notebook.models import NotebookEntry
from app.notebook.schemas import NotebookEntryCreateRequest, NotebookEntryUpdateRequest


def list_notebook_entries(db: Session, user_id: uuid.UUID) -> list[NotebookEntry]:
    return list(
        db.scalars(
            select(NotebookEntry)
            .where(NotebookEntry.user_id == user_id)
            .order_by(NotebookEntry.created_at)
        )
    )


def create_notebook_entry(
    db: Session, user_id: uuid.UUID, data: NotebookEntryCreateRequest
) -> NotebookEntry:
    entry = NotebookEntry(
        user_id=user_id,
        type=data.type,
        content=data.content,
        strokes=[s.model_dump() for s in data.strokes] if data.strokes is not None else None,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def _get_owned_entry(db: Session, entry_id: uuid.UUID, user_id: uuid.UUID) -> NotebookEntry:
    entry = db.get(NotebookEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise ApiError(404, "not_found", "Notebook entry not found")
    return entry


def update_notebook_entry(
    db: Session, entry_id: uuid.UUID, user_id: uuid.UUID, data: NotebookEntryUpdateRequest
) -> NotebookEntry:
    entry = _get_owned_entry(db, entry_id, user_id)
    if data.content is not None:
        entry.content = data.content
    if data.strokes is not None:
        entry.strokes = [s.model_dump() for s in data.strokes]
    db.commit()
    db.refresh(entry)
    return entry


def delete_notebook_entry(db: Session, entry_id: uuid.UUID, user_id: uuid.UUID) -> None:
    entry = _get_owned_entry(db, entry_id, user_id)
    db.delete(entry)
    db.commit()
