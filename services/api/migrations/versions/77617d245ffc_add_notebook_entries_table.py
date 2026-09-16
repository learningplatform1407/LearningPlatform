"""add notebook_entries table

Revision ID: 77617d245ffc
Revises: 1e8f79a40933
Create Date: 2026-09-16 21:48:36.023759

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "77617d245ffc"
down_revision: str | Sequence[str] | None = "1e8f79a40933"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) — same known drift noted in
# 07f6e847d3b9, 8a30c490fd32, d59e08b4c331, and 1e8f79a40933. Omitted.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "notebook_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("content", sa.String(), nullable=True),
        sa.Column("strokes", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("notebook_entries")
