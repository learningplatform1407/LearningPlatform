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
    # Flush before adding the subscription: Subscription has no ORM
    # relationship() to Profile (it's looked up independently), so nothing
    # tells SQLAlchemy's autoflush ordering that profiles must be inserted
    # first. SQLite doesn't enforce the FK either way, but Postgres does.
    db.flush()

    db.add(Subscription(user_id=user.id, plan_code=PlanCode.FREE, status="active"))
    db.commit()
    db.refresh(profile)
    return profile


SETTINGS_FIELDS = {"theme", "notifications_enabled", "language"}


def update_profile(db: Session, profile: Profile, data: ProfileUpdateRequest) -> Profile:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        target = profile.settings if field in SETTINGS_FIELDS else profile
        setattr(target, field, value)
    db.commit()
    db.refresh(profile)
    return profile
