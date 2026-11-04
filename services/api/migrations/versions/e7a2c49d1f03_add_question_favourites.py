"""add question_favourites

Revision ID: e7a2c49d1f03
Revises: d3f81b6a2c94
Create Date: 2026-11-04 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7a2c49d1f03"
down_revision: str | Sequence[str] | None = "d3f81b6a2c94"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# A learner's favourite questions -- the heart in the question list
# (docs/design/implementation-notes.md, DESIGN-6). New table, nothing existing
# changes. Both foreign keys cascade: a favourite means nothing once either
# the learner or the question is gone.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "question_favourites",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "question_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("question_favourites")
