"""add sub_chapters, quizzes, flashcards, lesson_notes; move documents to sub_chapter_id

Revision ID: d59e08b4c331
Revises: 8a30c490fd32
Create Date: 2026-09-08 23:36:09.830306

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d59e08b4c331"
down_revision: str | Sequence[str] | None = "8a30c490fd32"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) — same known drift noted in
# 07f6e847d3b9 and 8a30c490fd32 (SQLAlchemy model uses generic JSON for
# SQLite test compatibility, the live column is already JSONB). Omitted.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "sub_chapters",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "flashcards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("front_text", sa.String(), nullable=False),
        sa.Column("back_text", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "lesson_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "document_id", name="uq_lesson_notes_user_document"),
    )
    op.create_table(
        "quizzes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("documents", sa.Column("sub_chapter_id", sa.Uuid(), nullable=True))
    op.drop_constraint("fk_documents_chapter_id_chapters", "documents", type_="foreignkey")
    op.create_foreign_key(
        "fk_documents_sub_chapter_id_sub_chapters",
        "documents",
        "sub_chapters",
        ["sub_chapter_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("documents", "chapter_id")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "documents", sa.Column("chapter_id", sa.Uuid(), autoincrement=False, nullable=True)
    )
    op.drop_constraint(
        "fk_documents_sub_chapter_id_sub_chapters", "documents", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_documents_chapter_id_chapters",
        "documents",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("documents", "sub_chapter_id")
    op.drop_table("quizzes")
    op.drop_table("lesson_notes")
    op.drop_table("flashcards")
    op.drop_table("sub_chapters")
