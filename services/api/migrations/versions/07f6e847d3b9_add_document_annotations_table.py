"""add document_annotations table

Revision ID: 07f6e847d3b9
Revises: fd66a6611155
Create Date: 2026-09-07 19:45:54.561671

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "07f6e847d3b9"
down_revision: str | Sequence[str] | None = "fd66a6611155"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) — that's just the SQLAlchemy model
# using the generic JSON type (for SQLite test compatibility) diverging from
# the live column, which is already JSONB and fine as-is. Deliberately
# omitted here; the live column doesn't need to change.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "document_annotations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("block_index", sa.Integer(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=True),
        sa.Column("end_offset", sa.Integer(), nullable=True),
        sa.Column("note_text", sa.String(), nullable=True),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("document_annotations")
