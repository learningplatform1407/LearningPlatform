"""add activity_events

Revision ID: b3d82e6f1a47
Revises: a91f3c0d7e25
Create Date: 2026-11-11 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3d82e6f1a47"
down_revision: str | Sequence[str] | None = "a91f3c0d7e25"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Social, phase 3: what the people you follow have done lately
# (docs/architecture/social.md). New table, starts empty, no backfill.
# subject_id has no foreign key on purpose -- see ActivityEvent.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "activity_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_activity_events_user_id_created_at", "activity_events", ["user_id", "created_at"]
    )
    op.create_index(
        "uq_activity_events_user_id_kind_subject_id",
        "activity_events",
        ["user_id", "kind", "subject_id"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_activity_events_user_id_kind_subject_id", table_name="activity_events")
    op.drop_index("ix_activity_events_user_id_created_at", table_name="activity_events")
    op.drop_table("activity_events")
