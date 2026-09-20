"""unify notes into notebook_entries

Revision ID: 105a91c866a4
Revises: 77617d245ffc
Create Date: 2026-09-20 02:01:46.235140

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "105a91c866a4"
down_revision: str | Sequence[str] | None = "77617d245ffc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) — same known drift noted in
# 07f6e847d3b9, 8a30c490fd32, d59e08b4c331, 1e8f79a40933, and 77617d245ffc.
# Omitted.


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "notebook_entries", sa.Column("source_document_id", sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        "notebook_entries_source_document_id_fkey",
        "notebook_entries",
        "documents",
        ["source_document_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Carry existing per-lesson notes forward as ordinary text notes before
    # the table they live in goes away — `source_document_id` records which
    # lesson each one came from, for free, via the same soft-metadata column
    # notes created from the lesson reader's panel use going forward.
    op.execute(
        """
        INSERT INTO notebook_entries
            (id, user_id, type, content, source_document_id, created_at, updated_at)
        SELECT gen_random_uuid(), user_id, 'text', content, document_id, updated_at, updated_at
        FROM lesson_notes
        """
    )

    op.drop_table("lesson_notes")


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        "lesson_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "document_id", name="uq_lesson_notes_user_document"),
    )
    op.drop_constraint(
        "notebook_entries_source_document_id_fkey", "notebook_entries", type_="foreignkey"
    )
    op.drop_column("notebook_entries", "source_document_id")
