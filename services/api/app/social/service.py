import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import ColumnElement, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.common.errors import ApiError
from app.social.constants import MAX_SEARCH_RESULTS, MIN_SEARCH_LENGTH
from app.social.models import Follow
from app.social.schemas import PublicProfileResponse, UserSummaryResponse
from app.users.models import AccountSettings, Profile
from app.users.stats import build_profile_stats


def _is_public(user_id: InstrumentedAttribute[uuid.UUID]) -> ColumnElement[bool]:
    """True when `user_id` has a public profile. Every read that shows one
    learner to another goes through this, so going private hides someone
    everywhere at once without touching their follow rows."""
    return (
        select(AccountSettings.profile_public)
        .where(AccountSettings.user_id == user_id)
        .scalar_subquery()
        .is_(True)
    )


def _not_found() -> ApiError:
    # The same answer for "no such user" and "private": telling them apart
    # would confirm a private account exists.
    return ApiError(404, "user_not_found", "User not found")


def _get_visible_profile(db: Session, viewer_id: uuid.UUID, user_id: uuid.UUID) -> Profile:
    profile = db.get(Profile, user_id)
    if profile is None:
        raise _not_found()
    if profile.id != viewer_id and not profile.settings.profile_public:
        raise _not_found()
    return profile


def _summaries(
    db: Session, viewer_id: uuid.UUID, profiles: Sequence[Profile]
) -> list[UserSummaryResponse]:
    """Two queries for the relationship flags, however many rows."""
    ids = [profile.id for profile in profiles]
    following = (
        set(
            db.scalars(
                select(Follow.followee_id).where(
                    Follow.follower_id == viewer_id, Follow.followee_id.in_(ids)
                )
            )
        )
        if ids
        else set()
    )
    followers = (
        set(
            db.scalars(
                select(Follow.follower_id).where(
                    Follow.followee_id == viewer_id, Follow.follower_id.in_(ids)
                )
            )
        )
        if ids
        else set()
    )
    return [
        UserSummaryResponse(
            id=profile.id,
            display_name=profile.display_name,
            avatar_url=profile.avatar_url,
            university=profile.university,
            is_following=profile.id in following,
            follows_you=profile.id in followers,
        )
        for profile in profiles
    ]


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_users(db: Session, viewer_id: uuid.UUID, query: str) -> list[UserSummaryResponse]:
    """Public learners whose display name contains `query`. Name only, by
    design: email and university are never matched."""
    needle = query.strip()
    if len(needle) < MIN_SEARCH_LENGTH:
        return []
    profiles = db.scalars(
        select(Profile)
        .where(
            Profile.id != viewer_id,
            Profile.display_name.ilike(f"%{_escape_like(needle)}%", escape="\\"),
            _is_public(Profile.id),
        )
        .order_by(func.lower(Profile.display_name), Profile.id)
        .limit(MAX_SEARCH_RESULTS)
    ).all()
    return _summaries(db, viewer_id, profiles)


def _count_public(
    db: Session, column: InstrumentedAttribute[uuid.UUID], where: ColumnElement[bool]
) -> int:
    return db.scalar(select(func.count()).select_from(Follow).where(where, _is_public(column))) or 0


def get_public_profile(
    db: Session, viewer_id: uuid.UUID, user_id: uuid.UUID, today: date
) -> PublicProfileResponse:
    profile = _get_visible_profile(db, viewer_id, user_id)
    [summary] = _summaries(db, viewer_id, [profile])
    return PublicProfileResponse(
        **summary.model_dump(),
        created_at=profile.created_at,
        followers_count=_count_public(db, Follow.follower_id, Follow.followee_id == profile.id),
        following_count=_count_public(db, Follow.followee_id, Follow.follower_id == profile.id),
        stats=build_profile_stats(db, profile.id, today),
    )


def follow_user(db: Session, viewer_id: uuid.UUID, user_id: uuid.UUID) -> None:
    if user_id == viewer_id:
        raise ApiError(400, "cannot_follow_self", "You can't follow yourself")
    _get_visible_profile(db, viewer_id, user_id)
    if db.get(Follow, (viewer_id, user_id)) is not None:
        return
    # A double-click races two inserts of the same pair; the loser's unique
    # violation means the follow already exists, which is what was asked.
    savepoint = db.begin_nested()
    try:
        db.add(Follow(follower_id=viewer_id, followee_id=user_id))
        db.flush()
    except IntegrityError:
        savepoint.rollback()
    db.commit()


def unfollow_user(db: Session, viewer_id: uuid.UUID, user_id: uuid.UUID) -> None:
    # No visibility check: unfollowing someone who went private must still
    # work, and it reveals nothing.
    db.execute(delete(Follow).where(Follow.follower_id == viewer_id, Follow.followee_id == user_id))
    db.commit()


def remove_follower(db: Session, viewer_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db.execute(delete(Follow).where(Follow.follower_id == user_id, Follow.followee_id == viewer_id))
    db.commit()


def _list(
    db: Session,
    viewer_id: uuid.UUID,
    other: InstrumentedAttribute[uuid.UUID],
    where: ColumnElement[bool],
) -> list[UserSummaryResponse]:
    profiles = db.scalars(
        select(Profile)
        .join(Follow, other == Profile.id)
        .where(where, _is_public(Profile.id))
        .order_by(func.lower(Profile.display_name), Profile.id)
    ).all()
    return _summaries(db, viewer_id, profiles)


def list_following(db: Session, viewer_id: uuid.UUID) -> list[UserSummaryResponse]:
    return _list(db, viewer_id, Follow.followee_id, Follow.follower_id == viewer_id)


def list_followers(db: Session, viewer_id: uuid.UUID) -> list[UserSummaryResponse]:
    return _list(db, viewer_id, Follow.follower_id, Follow.followee_id == viewer_id)
