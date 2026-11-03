"""add lecture_pdfs.page_count

Revision ID: b4c71e9f2a08
Revises: df30055a596d
Create Date: 2026-11-02 10:12:44.019283

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4c71e9f2a08"
down_revision: str | Sequence[str] | None = "df30055a596d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# A separate migration rather than an edit to df30055a596d, which created
# this table: that revision has already been applied to dev, so amending it
# in place would leave any database that ran it without the column and with
# nothing left to upgrade.
#
# server_default="1" exists so NOT NULL can be added without a rewrite on any
# row predating the column.
#
# Every *future* insert sets page_count explicitly from `validate_pdf` (see
# upsert_lecture_pdf) -- but rows predating this migration keep the default,
# and 1 is wrong for all but a single-page PDF. Not hypothetical: the one
# lecture_pdfs row in dev was a 9-page document left claiming 1, which
# silently clamped both clients to "Page 1 of 1" and made upsert_ink reject
# pages 2-9 as out of range.
#
# The true count can only come from the PDF itself, which means Storage I/O,
# which does not belong in a migration. So pre-existing rows need a one-off
# backfill that downloads each `storage_path` and writes `validate_pdf`'s
# result. Dev has been backfilled; any other environment that ran this
# migration needs the same before its lecture PDFs behave.
#
# A nullable column would have represented "unknown" honestly rather than
# asserting a wrong 1 -- see docs/architecture/lecture-pdf-ink.md §5.
#
# Note: autogenerate again proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) and dropping ix_feed_posts_author_id /
# ix_feed_posts_published_at -- the same known pre-existing drift
# df30055a596d documents and strips. Both omitted here too.


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "lecture_pdfs",
        sa.Column("page_count", sa.Integer(), server_default="1", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("lecture_pdfs", "page_count")
