import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Follow(Base):
    """One learner following another. One-way, with no request or approval:
    who may be followed is decided by the followee's `profile_public`
    setting instead (docs/architecture/social.md).

    A row is never deleted when its followee goes private. It stays and is
    ignored, because every list, count and activity read only counts public
    users, so switching back to public brings the followers back with it.
    """

    __tablename__ = "follows"
    __table_args__ = (
        # Mirrors the constraint in the migration, so the SQLite suite (built
        # from Base.metadata) enforces it too.
        CheckConstraint("follower_id <> followee_id", name="ck_follows_not_self"),
        Index("ix_follows_followee_id", "followee_id"),
    )

    follower_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    followee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
