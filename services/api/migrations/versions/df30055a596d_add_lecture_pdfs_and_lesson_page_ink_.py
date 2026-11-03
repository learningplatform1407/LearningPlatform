"""add lecture_pdfs and lesson_page_ink tables

Revision ID: df30055a596d
Revises: 7a3e52d9c0b1
Create Date: 2026-10-29 09:54:03.734508

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "df30055a596d"
down_revision: str | Sequence[str] | None = "7a3e52d9c0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) -- same known drift every prior
# migration touching this table has stripped (the model uses generic JSON
# for SQLite test compatibility; the live column is already JSONB and fine
# as-is). It also proposed dropping ix_feed_posts_author_id and
# ix_feed_posts_published_at, unrelated pre-existing drift on a table this
# migration never touches. Both omitted.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "lecture_pdfs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id"),
    )
    op.create_table(
        "lesson_page_ink",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lecture_pdf_id", sa.Uuid(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("strokes", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["lecture_pdf_id"], ["lecture_pdfs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "lecture_pdf_id", "page_number", "user_id", name="uq_lesson_page_ink_pdf_page_user"
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("lesson_page_ink")
    op.drop_table("lecture_pdfs")
