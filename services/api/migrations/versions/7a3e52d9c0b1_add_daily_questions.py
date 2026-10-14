"""add daily_questions and daily_question_attempts

Revision ID: 7a3e52d9c0b1
Revises: c93f08b5d174
Create Date: 2026-10-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7a3e52d9c0b1"
down_revision: str | Sequence[str] | None = "c93f08b5d174"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Written by hand, no local Postgres to autogenerate against — the constraint
# noted in 4486187e5db2, 0580a837dd2e, 30a5926fe43e, 6c2d41a7b9e3 and
# 4b1d7ea3c602.
#
# `for_date` is the first sa.Date column in this schema. Everything else is
# DateTime(timezone=True) because everything else reasons about instants; a
# calendar day only exists relative to a timezone, and that conversion lives
# in app/core/clock.py.
#
# The composite FK on the attempts table is the point of the pair: it makes
# "an attempt cannot exist for a day with no draw" and "a day's question
# cannot change while attempts exist" invariants the database enforces, rather
# than rules the service merely tries to keep. That is why daily_questions
# carries a unique constraint on (for_date, question_id) which is otherwise
# redundant against its primary key — the child needs a unique index to
# reference.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "daily_questions",
        sa.Column("for_date", sa.Date(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("selected_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # RESTRICT, not CASCADE: questions are archived rather than deleted,
        # but were one ever removed, cascading would erase a day people had
        # already answered along with their scores.
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["selected_by"], ["profiles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("for_date"),
        sa.UniqueConstraint("for_date", "question_id", name="uq_daily_questions_date_question"),
    )

    op.create_table(
        "daily_question_attempts",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("for_date", sa.Date(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("selected_option_ids", sa.JSON(), nullable=False),
        sa.Column("points_awarded", sa.Integer(), nullable=False),
        sa.Column("points_possible", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        # No server_default: Python-stamped, matching
        # question_progress.last_answered_at, because SQLite's
        # CURRENT_TIMESTAMP is second-granularity and ties break ordering.
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["for_date", "question_id"],
            ["daily_questions.for_date", "daily_questions.question_id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
            name="fk_daily_question_attempts_day",
        ),
        sa.PrimaryKeyConstraint("user_id", "for_date"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Attempts first: the composite FK points at daily_questions.
    op.drop_table("daily_question_attempts")
    op.drop_table("daily_questions")
