"""add flashcard_review_states.suspended

Revision ID: 9f4b7c21d508
Revises: 6c2d41a7b9e3
Create Date: 2026-10-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f4b7c21d508"
down_revision: str | Sequence[str] | None = "6c2d41a7b9e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Written by hand, no local Postgres to autogenerate against — same
# constraint noted in 4486187e5db2, 0580a837dd2e, 30a5926fe43e and
# 6c2d41a7b9e3.
#
# Lets a learner take one card out of their own rotation, reversibly. Lives
# on the per-(user, card) review state rather than on the card, so suspending
# a shared official card leaves every other learner's deck untouched; the
# global lever for official content is `flashcards.status`.


def upgrade() -> None:
    """Upgrade schema."""
    # server_default is what makes this safe to add to a populated table in
    # one statement: existing rows become false rather than violating the
    # NOT NULL. It is kept afterwards (rather than dropped) so a row inserted
    # by raw SQL, outside the ORM's Python-side default, still lands in the
    # rotation rather than NULL.
    op.add_column(
        "flashcard_review_states",
        sa.Column("suspended", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("flashcard_review_states", "suspended")
