"""add questions.source_quotes

Revision ID: d3f81b6a2c94
Revises: c8e2a5d17f40
Create Date: 2026-11-04 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3f81b6a2c94"
down_revision: str | Sequence[str] | None = "c8e2a5d17f40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Lesson sentences behind a question's options, for the Quizzes tab's "See in
# lesson" (docs/design/implementation-notes.md, DESIGN-3). Additive, and the
# server default is right for every existing question: none has sources until
# an import or an edit gives it some.


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "questions",
        sa.Column("source_quotes", sa.JSON(), server_default="[]", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("questions", "source_quotes")
