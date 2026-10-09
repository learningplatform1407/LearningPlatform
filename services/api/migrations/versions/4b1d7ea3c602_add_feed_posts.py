"""add feed_posts

Revision ID: 4b1d7ea3c602
Revises: 9f4b7c21d508
Create Date: 2026-10-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4b1d7ea3c602"
down_revision: str | Sequence[str] | None = "9f4b7c21d508"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Written by hand, no local Postgres to autogenerate against — same
# constraint noted in 4486187e5db2, 0580a837dd2e, 30a5926fe43e and 6c2d41a7b9e3.
#
# FEED-1. Supersedes the epic's original column list: no draft machinery, and
# no `link_url` (a URL belongs in the body text, which the clients linkify),
# but with `author_id` and `image_path` added.
#
# Note author_id is the first `created_by`-shaped FK in this schema that is NOT
# CASCADE. An announcement is institutional and must outlive the admin who
# wrote it, so deleting a profile nulls the byline instead of erasing the
# notice. The seven existing CASCADE columns are unchanged — that is HARDEN-8,
# which should land once across all of them rather than per table.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "feed_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("image_path", sa.String(), nullable=True),
        # Nullable *because* of the SET NULL below — the ORM declares it
        # Mapped[uuid.UUID | None], and these two have to agree. The SQLite
        # test suite builds from Base.metadata rather than by running
        # migrations, so it cannot catch a mismatch here; ac4940c had to fix
        # exactly that drift after the fact.
        sa.Column("author_id", sa.Uuid(), nullable=True),
        # nullable=False matters even with a server_default: without it the
        # column is created nullable in Postgres while the ORM declares a
        # non-optional Mapped[datetime].
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["author_id"], ["profiles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    # The list query's only ordering. Indexes live in migrations rather than as
    # index=True on the model, consistent with the rest of this directory.
    op.create_index("ix_feed_posts_published_at", "feed_posts", ["published_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_feed_posts_published_at", table_name="feed_posts")
    op.drop_table("feed_posts")
