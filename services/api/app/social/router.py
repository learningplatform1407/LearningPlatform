from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.daily.dependencies import Clock, get_clock
from app.db.session import get_db
from app.social.constants import MAX_SEARCH_LENGTH
from app.social.schemas import PublicProfileResponse, UserSummaryResponse
from app.social.service import (
    follow_user,
    get_public_profile,
    list_followers,
    list_following,
    remove_follower,
    search_users,
    unfollow_user,
)
from app.users.service import get_or_create_profile

router = APIRouter(prefix="/v1", tags=["social"])


# Declared before /users/{user_id} so "search" is never read as an id.
@router.get("/users/search", response_model=list[UserSummaryResponse])
def search(
    q: str = Query(max_length=MAX_SEARCH_LENGTH),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserSummaryResponse]:
    return search_users(db, user.id, q)


@router.get("/users/{user_id}", response_model=PublicProfileResponse)
def read_profile(
    user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> PublicProfileResponse:
    return get_public_profile(db, user.id, user_id, clock.today)


@router.post("/users/{user_id}/follow", status_code=204)
def follow(
    user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    # The follower row references profiles.id, and a brand-new account may
    # not have one yet.
    get_or_create_profile(db, user)
    follow_user(db, user.id, user_id)
    return Response(status_code=204)


@router.delete("/users/{user_id}/follow", status_code=204)
def unfollow(
    user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    unfollow_user(db, user.id, user_id)
    return Response(status_code=204)


@router.delete("/me/followers/{user_id}", status_code=204)
def delete_follower(
    user_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    remove_follower(db, user.id, user_id)
    return Response(status_code=204)


@router.get("/me/following", response_model=list[UserSummaryResponse])
def read_following(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserSummaryResponse]:
    return list_following(db, user.id)


@router.get("/me/followers", response_model=list[UserSummaryResponse])
def read_followers(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserSummaryResponse]:
    return list_followers(db, user.id)
