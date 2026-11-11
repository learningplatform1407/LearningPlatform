import uuid

from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import InstrumentedAttribute

from app.users.models import AccountSettings


def is_public(user_id: InstrumentedAttribute[uuid.UUID]) -> ColumnElement[bool]:
    """True when `user_id` has a public profile. Every read that shows one
    learner to another goes through this, so going private hides someone
    everywhere at once without touching their follow rows or activity.

    Its own module, with nothing but the users model behind it, because the
    activity recorder is imported by quizzes, progress and daily, which the
    rest of app.social (via the profile stats) imports in turn."""
    return (
        select(AccountSettings.profile_public)
        .where(AccountSettings.user_id == user_id)
        .scalar_subquery()
        .is_(True)
    )
