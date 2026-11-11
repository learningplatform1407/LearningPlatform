import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.challenges.constants import ChallengeStatus
from app.db.base import Base


class Challenge(Base):
    """One learner daring another to the exact exam they just took: same
    questions, same order, same timer. Only between mutual follows
    (docs/architecture/social.md).

    `source_session_id` is the challenger's finished attempt, and the
    questions are read from it rather than copied, so a challenge can't drift
    from what the challenger actually answered. `challengee_session_id` is
    set on accept; finishing that session completes the challenge
    (app/challenges/completion.py).
    """

    __tablename__ = "challenges"
    __table_args__ = (
        # A finished exam can be sent to the same person once.
        UniqueConstraint(
            "source_session_id", "challengee_id", name="uq_challenges_source_session_challengee"
        ),
        CheckConstraint("challenger_id <> challengee_id", name="ck_challenges_not_self"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'completed', 'declined', 'expired')",
            name="ck_challenges_status",
        ),
        Index("ix_challenges_challenger_id", "challenger_id"),
        Index("ix_challenges_challengee_id", "challengee_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    challenger_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    challengee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    source_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="CASCADE")
    )
    challengee_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="SET NULL"), default=None
    )
    status: Mapped[str] = mapped_column(String, default=ChallengeStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
