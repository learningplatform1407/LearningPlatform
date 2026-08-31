"""add language to account settings

Revision ID: be7a4e51e577
Revises: 02b46bada19d
Create Date: 2026-08-31 23:08:46.729804

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "be7a4e51e577"
down_revision: str | Sequence[str] | None = "02b46bada19d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "account_settings",
        sa.Column("language", sa.String(), nullable=False, server_default="en"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("account_settings", "language")
