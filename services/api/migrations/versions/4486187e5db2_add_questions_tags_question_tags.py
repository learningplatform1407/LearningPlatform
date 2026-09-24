"""add questions, tags, question_tags

Revision ID: 4486187e5db2
Revises: 105a91c866a4
Create Date: 2026-09-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4486187e5db2"
down_revision: str | Sequence[str] | None = "105a91c866a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Note: autogenerate also proposed alter_column('document_versions',
# 'extracted_content', JSONB -> JSON) — same known drift noted in
# 07f6e847d3b9, 8a30c490fd32, d59e08b4c331, 1e8f79a40933, 77617d245ffc, and
# 105a91c866a4. Omitted.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(), nullable=True),
        sa.Column("document_id", sa.Uuid(), nullable=True),
        sa.Column("prompt", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("scoring_scheme", sa.String(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("correct_option_ids", sa.JSON(), nullable=False),
        sa.Column("rationales", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.String(), nullable=True),
        sa.Column("difficulty", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "question_tags",
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("question_id", "tag_id"),
    )
    # The sampler's subquery filters on tag_id, the PK's non-leading column,
    # which a btree can't seek on without this second index — see
    # app/questions/models.py's QuestionTag docstring.
    op.create_index(
        "ix_question_tags_tag_id_question_id", "question_tags", ["tag_id", "question_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_question_tags_tag_id_question_id", table_name="question_tags")
    op.drop_table("question_tags")
    op.drop_table("tags")
    op.drop_table("questions")
