from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.notebook.schemas import (
    NotebookEntryCreateRequest,
    NotebookEntryResponse,
    NotebookEntryUpdateRequest,
)
from app.notebook.service import (
    create_notebook_entry,
    delete_notebook_entry,
    list_notebook_entries,
    update_notebook_entry,
)
from app.users.service import get_or_create_profile

router = APIRouter(prefix="/v1/notebook-entries", tags=["notebook"])


@router.get("", response_model=list[NotebookEntryResponse])
def read_notebook_entries(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NotebookEntryResponse]:
    entries = list_notebook_entries(db, user.id)
    return [NotebookEntryResponse.model_validate(e) for e in entries]


@router.post("", response_model=NotebookEntryResponse)
def create_notebook_entry_route(
    data: NotebookEntryCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotebookEntryResponse:
    # Same FK-ordering guard as annotations/lesson_notes: a user could hit
    # this before ever calling GET /v1/me, which is what normally creates
    # the profile row this entry needs to FK against.
    profile = get_or_create_profile(db, user)
    entry = create_notebook_entry(db, profile.id, data)
    return NotebookEntryResponse.model_validate(entry)


@router.put("/{entry_id}", response_model=NotebookEntryResponse)
def update_notebook_entry_route(
    entry_id: UUID,
    data: NotebookEntryUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotebookEntryResponse:
    entry = update_notebook_entry(db, entry_id, user.id, data)
    return NotebookEntryResponse.model_validate(entry)


@router.delete("/{entry_id}", status_code=204)
def delete_notebook_entry_route(
    entry_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    delete_notebook_entry(db, entry_id, user.id)
