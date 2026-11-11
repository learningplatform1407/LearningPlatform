"""add follows and public profiles

Revision ID: a91f3c0d7e25
Revises: e7a2c49d1f03
Create Date: 2026-11-11 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a91f3c0d7e25"
down_revision: str | Sequence[str] | None = "e7a2c49d1f03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Social, phase 1 (docs/architecture/social.md). Purely additive: every
# existing account starts private, so nobody becomes searchable or followable
# until they switch it on themselves.


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "account_settings",
        sa.Column("profile_public", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "follows",
        sa.Column("follower_id", sa.Uuid(), nullable=False),
        sa.Column("followee_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("follower_id <> followee_id", name="ck_follows_not_self"),
        sa.ForeignKeyConstraint(["follower_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["followee_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("follower_id", "followee_id"),
    )
    op.create_index("ix_follows_followee_id", "follows", ["followee_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_follows_followee_id", table_name="follows")
    op.drop_table("follows")
    op.drop_column("account_settings", "profile_public")
