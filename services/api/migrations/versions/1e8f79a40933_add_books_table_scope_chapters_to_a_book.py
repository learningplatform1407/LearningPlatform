"""add books table, scope chapters to a book

Revision ID: 1e8f79a40933
Revises: d59e08b4c331
Create Date: 2026-09-16 20:59:48.791917

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1e8f79a40933"
down_revision: str | Sequence[str] | None = "d59e08b4c331"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) — same known drift noted in
# 07f6e847d3b9, 8a30c490fd32, and d59e08b4c331. Omitted.

# Real UUID literal (not a dynamically generated one) so it's stable across
# upgrade/downgrade and easy to spot in a `SELECT * FROM books` afterward.
_SEED_BOOK_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "books",
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

    # book_id starts nullable so existing chapters can be backfilled to a seed
    # book before the NOT NULL constraint goes on — every chapter needs a
    # book, but there was no such thing before this migration.
    op.add_column("chapters", sa.Column("book_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_chapters_book_id_books", "chapters", "books", ["book_id"], ["id"], ondelete="CASCADE"
    )

    connection = op.get_bind()
    existing_chapter = connection.execute(sa.text("SELECT 1 FROM chapters LIMIT 1")).first()
    if existing_chapter is not None:
        # created_by must be a real profile — reuse whichever admin created
        # the first chapter rather than inventing a foreign key that doesn't
        # exist yet.
        seed_creator = connection.execute(
            sa.text("SELECT created_by FROM chapters ORDER BY created_at LIMIT 1")
        ).scalar_one()
        connection.execute(
            sa.text(
                "INSERT INTO books (id, title, order_index, created_by) "
                "VALUES (:id, :title, 0, :created_by)"
            ),
            {"id": _SEED_BOOK_ID, "title": "Main Library", "created_by": seed_creator},
        )
        connection.execute(
            sa.text("UPDATE chapters SET book_id = :id WHERE book_id IS NULL"),
            {"id": _SEED_BOOK_ID},
        )

    op.alter_column("chapters", "book_id", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_chapters_book_id_books", "chapters", type_="foreignkey")
    op.drop_column("chapters", "book_id")
    op.drop_table("books")
