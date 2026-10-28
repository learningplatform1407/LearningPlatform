from sqlalchemy.exc import IntegrityError
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

    # Two requests racing a brand-new account both see no row. Postgres blocks
    # the second INSERT until the first commits, then raises a unique
    # violation on profiles_pkey — catch it and return the row the other
    # transaction just created, the same pattern question progress uses.
    #
    # Not hypothetical: a first sign-in fans out several GET /v1/me calls at
    # once (every screen the tab navigator mounts asks for ["me"]), so the
    # loser of that race surfaced as a 500 on a fresh account.
    savepoint = db.begin_nested()
    try:
        profile = Profile(id=user.id, settings=AccountSettings(user_id=user.id))
        db.add(profile)
        # Flush before adding the subscription: Subscription has no ORM
        # relationship() to Profile (it's looked up independently), so nothing
        # tells SQLAlchemy's autoflush ordering that profiles must be inserted
        # first. SQLite doesn't enforce the FK either way, but Postgres does.
        db.flush()
    except IntegrityError:
        savepoint.rollback()
        raced = db.get(Profile, user.id)
        if raced is None:
            raise
        # The winner created the settings and subscription in the same
        # transaction, so there is nothing left to add.
        return raced

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
