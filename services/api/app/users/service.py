from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.plans.constants import PlanCode
from app.plans.models import Subscription
from app.users.models import AccountSettings, Profile
from app.users.schemas import ProfileUpdateRequest


def get_or_create_profile(db: Session, user: AuthenticatedUser) -> Profile:
    profile = db.get(Profile, user.id)
    if profile is not None:
        return profile

    profile = Profile(id=user.id, settings=AccountSettings(user_id=user.id))
    db.add(profile)
    db.add(Subscription(user_id=user.id, plan_code=PlanCode.FREE, status="active"))

    db.commit()
    db.refresh(profile)
    return profile


def update_profile(db: Session, profile: Profile, data: ProfileUpdateRequest) -> Profile:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile
