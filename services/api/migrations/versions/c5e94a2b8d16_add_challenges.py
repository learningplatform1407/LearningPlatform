"""add challenges

Revision ID: c5e94a2b8d16
Revises: b3d82e6f1a47
Create Date: 2026-11-11 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5e94a2b8d16"
down_revision: str | Sequence[str] | None = "b3d82e6f1a47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Social, phase 4: challenge someone you follow (and who follows you back) to
# the exam you just took (docs/architecture/social.md). New table only.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("challenger_id", sa.Uuid(), nullable=False),
        sa.Column("challengee_id", sa.Uuid(), nullable=False),
        sa.Column("source_session_id", sa.Uuid(), nullable=False),
        sa.Column("challengee_session_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("challenger_id <> challengee_id", name="ck_challenges_not_self"),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'completed', 'declined', 'expired')",
            name="ck_challenges_status",
        ),
        sa.ForeignKeyConstraint(["challenger_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["challengee_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_session_id"], ["quiz_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["challengee_session_id"], ["quiz_sessions.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_session_id", "challengee_id", name="uq_challenges_source_session_challengee"
        ),
    )
    op.create_index("ix_challenges_challenger_id", "challenges", ["challenger_id"])
    op.create_index("ix_challenges_challengee_id", "challenges", ["challengee_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_challenges_challengee_id", table_name="challenges")
    op.drop_index("ix_challenges_challenger_id", table_name="challenges")
    op.drop_table("challenges")
