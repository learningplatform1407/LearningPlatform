"""add flashcard scope/status/external_id and flashcard_review_states, drop quizzes

Revision ID: 6c2d41a7b9e3
Revises: 30a5926fe43e
Create Date: 2026-10-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6c2d41a7b9e3"
down_revision: str | Sequence[str] | None = "30a5926fe43e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Written by hand, no local Postgres to autogenerate against — same
# constraint noted in 4486187e5db2, 0580a837dd2e and 30a5926fe43e.
#
# `flashcards` already existed as a shell table (no write path, no authoring
# UI, empty everywhere) created in d59e08b4c331. This turns it into the real
# feature: the provenance axis (official vs personal), an import idempotency
# key, and a publication status. `created_by` is deliberately left CASCADE —
# see the HARDEN ticket on account deletion, which covers all seven content
# tables at once rather than patching this one.


def upgrade() -> None:
    """Upgrade schema."""
    # Added nullable, backfilled, then made NOT NULL: the table is empty in
    # every environment, but a plain NOT NULL add would still fail on any
    # that isn't, and this costs one extra statement.
    op.add_column("flashcards", sa.Column("scope", sa.String(), nullable=True))
    op.add_column("flashcards", sa.Column("status", sa.String(), nullable=True))
    op.add_column("flashcards", sa.Column("external_id", sa.String(), nullable=True))
    op.execute(
        "UPDATE flashcards SET scope = 'official', status = 'published' "
        "WHERE scope IS NULL OR status IS NULL"
    )
    op.alter_column("flashcards", "scope", nullable=False)
    op.alter_column("flashcards", "status", nullable=False)

    # external_id stays nullable (personal cards have none) but must be unique
    # where present — it is the import's upsert key.
    op.create_unique_constraint("uq_flashcards_external_id", "flashcards", ["external_id"])
    # The deck draw and the lesson list both filter on exactly this triple.
    op.create_index(
        "ix_flashcards_document_scope_status",
        "flashcards",
        ["document_id", "scope", "status"],
    )
    op.create_index("ix_flashcards_created_by_scope", "flashcards", ["created_by", "scope"])

    op.create_table(
        "flashcard_review_states",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("flashcard_id", sa.Uuid(), nullable=False),
        sa.Column("ease_factor", sa.Float(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("repetitions", sa.Integer(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["flashcard_id"], ["flashcards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # One row per (user, card), created lazily on first grade. The absence
        # of a row is what "new" means, so this must stay unique.
        sa.UniqueConstraint("user_id", "flashcard_id", name="uq_flashcard_review_states_user_card"),
    )

    # QUIZ-11: `quizzes` was a shell record from the pre-question-bank design.
    # It had no write path, and as of this branch no reader either — a
    # lesson's questions are reached through questions.document_id.
    op.drop_table("quizzes")


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        "quizzes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.drop_table("flashcard_review_states")

    op.drop_index("ix_flashcards_created_by_scope", table_name="flashcards")
    op.drop_index("ix_flashcards_document_scope_status", table_name="flashcards")
    op.drop_constraint("uq_flashcards_external_id", "flashcards", type_="unique")
    op.drop_column("flashcards", "external_id")
    op.drop_column("flashcards", "status")
    op.drop_column("flashcards", "scope")
