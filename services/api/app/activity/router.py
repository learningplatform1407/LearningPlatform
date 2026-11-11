from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.activity.constants import DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT
from app.activity.feed import list_following_activity, list_user_activity
from app.activity.schemas import ActivityEventResponse
from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db

router = APIRouter(prefix="/v1", tags=["activity"])


@router.get("/me/activity", response_model=list[ActivityEventResponse])
def read_following_activity(
    before: datetime | None = None,
    limit: int = Query(DEFAULT_ACTIVITY_LIMIT, ge=1, le=MAX_ACTIVITY_LIMIT),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ActivityEventResponse]:
    """What the people you follow have done lately. Page back by passing the
    last event's `created_at` as `before`."""
    return list_following_activity(db, user.id, before=before, limit=limit)


@router.get("/users/{user_id}/activity", response_model=list[ActivityEventResponse])
def read_user_activity(
    user_id: UUID,
    before: datetime | None = None,
    limit: int = Query(DEFAULT_ACTIVITY_LIMIT, ge=1, le=MAX_ACTIVITY_LIMIT),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ActivityEventResponse]:
    return list_user_activity(db, user.id, user_id, before=before, limit=limit)
