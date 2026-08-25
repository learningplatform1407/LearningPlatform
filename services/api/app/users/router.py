from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.users.models import Profile
from app.users.schemas import AccountSettingsResponse, MeResponse, ProfileUpdateRequest
from app.users.service import get_or_create_profile, update_profile

router = APIRouter(prefix="/v1", tags=["users"])


def _to_me_response(profile: Profile, user: AuthenticatedUser) -> MeResponse:
    return MeResponse(
        id=profile.id,
        email=user.email,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        university=profile.university,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        settings=AccountSettingsResponse.model_validate(profile.settings),
    )


@router.get("/me", response_model=MeResponse)
def read_me(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    profile = get_or_create_profile(db, user)
    return _to_me_response(profile, user)


@router.patch("/me", response_model=MeResponse)
def patch_me(
    data: ProfileUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    profile = get_or_create_profile(db, user)
    profile = update_profile(db, profile, data)
    return _to_me_response(profile, user)
