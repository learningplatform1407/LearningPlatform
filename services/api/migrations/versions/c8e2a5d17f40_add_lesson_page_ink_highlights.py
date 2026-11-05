"""add lesson_page_ink.highlights

Revision ID: c8e2a5d17f40
Revises: b4c71e9f2a08
Create Date: 2026-11-04 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8e2a5d17f40"
down_revision: str | Sequence[str] | None = "b4c71e9f2a08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Word-level highlights on lecture PDF pages (docs/architecture/lecture-pdf-ink.md
# §2). Unlike b4c71e9f2a08's page_count, the server default here is simply
# right for every existing row: no page has highlights until someone makes
# one, so no backfill is needed.
#
# Autogenerate again proposed the known pre-existing drift
# (document_versions.extracted_content JSONB -> JSON, the two feed_posts
# indexes) that df30055a596d documents; omitted here as there.


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "lesson_page_ink",
        sa.Column("highlights", sa.JSON(), server_default="[]", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("lesson_page_ink", "highlights")
