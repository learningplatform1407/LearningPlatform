"""add question_progress

Revision ID: 30a5926fe43e
Revises: 0580a837dd2e
Create Date: 2026-09-30 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "30a5926fe43e"
down_revision: str | Sequence[str] | None = "0580a837dd2e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Written by hand, no local Postgres to autogenerate against — same
# constraint noted in 4486187e5db2 and 0580a837dd2e.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "question_progress",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("points_awarded", sa.Integer(), nullable=False),
        sa.Column("points_possible", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("last_answered_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        # One row per (user, question) — latest attempt wins, so the pair is
        # the identity rather than a surrogate key.
        sa.PrimaryKeyConstraint("user_id", "question_id"),
    )
    # The PK serves "how did this user do on this question". The topic
    # dashboard asks the other question — "how many of this user's answers
    # were correct" — grouping on outcome, which the PK cannot serve.
    op.create_index(
        "ix_question_progress_user_outcome", "question_progress", ["user_id", "outcome"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_question_progress_user_outcome", table_name="question_progress")
    op.drop_table("question_progress")
