"""add chapters, lesson_views, and document chapter grouping

Revision ID: 8a30c490fd32
Revises: 07f6e847d3b9
Create Date: 2026-09-08 21:17:49.121049

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8a30c490fd32"
down_revision: str | Sequence[str] | None = "07f6e847d3b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) — same known drift as 07f6e847d3b9
# (the SQLAlchemy model uses generic JSON for SQLite test compatibility,
# the live column is already JSONB and fine as-is). Deliberately omitted.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "chapters",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "lesson_views",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column(
            "last_viewed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "document_id", name="uq_lesson_views_user_document"),
    )
    op.add_column("documents", sa.Column("chapter_id", sa.Uuid(), nullable=True))
    op.add_column(
        "documents",
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_foreign_key(
        "fk_documents_chapter_id_chapters",
        "documents",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_documents_chapter_id_chapters", "documents", type_="foreignkey")
    op.drop_column("documents", "order_index")
    op.drop_column("documents", "chapter_id")
    op.drop_table("lesson_views")
    op.drop_table("chapters")
