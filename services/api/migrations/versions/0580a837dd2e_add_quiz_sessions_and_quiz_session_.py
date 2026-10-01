"""add quiz_sessions, quiz_session_questions

Revision ID: 0580a837dd2e
Revises: 4486187e5db2
Create Date: 2026-09-28 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0580a837dd2e"
down_revision: str | Sequence[str] | None = "4486187e5db2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Written by hand, no local Postgres to autogenerate against — same
# constraint noted in 4486187e5db2. Same JSONB-drift note applies to any
# future autogenerate against document_versions.extracted_content.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "quiz_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("reveal_mode", sa.String(), nullable=False),
        sa.Column("filter_spec", sa.JSON(), nullable=False),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("accumulated_seconds", sa.Integer(), nullable=False),
        sa.Column("resumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("points_awarded", sa.Integer(), nullable=True),
        sa.Column("points_possible", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Enforces one open (active/paused) session per user in the database
    # itself, so a double-clicked Start races into an IntegrityError rather
    # than two live sessions. Both Postgres and SQLite support partial
    # indexes, so the in-memory test suite genuinely covers this.
    op.create_index(
        "uq_quiz_sessions_one_open_per_user",
        "quiz_sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('active','paused')"),
        sqlite_where=sa.text("status IN ('active','paused')"),
    )

    op.create_table(
        "quiz_session_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("scoring_scheme", sa.String(), nullable=False),
        sa.Column("points_possible", sa.Integer(), nullable=False),
        sa.Column("selected_option_ids", sa.JSON(), nullable=True),
        sa.Column("points_awarded", sa.Integer(), nullable=True),
        sa.Column("outcome", sa.String(), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["quiz_sessions.id"], ondelete="CASCADE"),
        # RESTRICT, not CASCADE: a question referenced by any session must
        # stay archivable-only, never hard-deletable, so history keeps
        # resolving its FK (docs/architecture/quizzes.md §5.4, §8.2).
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "position", name="uq_quiz_session_questions_position"),
        sa.UniqueConstraint("session_id", "question_id", name="uq_quiz_session_questions_question"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("quiz_session_questions")
    op.drop_index("uq_quiz_sessions_one_open_per_user", table_name="quiz_sessions")
    op.drop_table("quiz_sessions")
