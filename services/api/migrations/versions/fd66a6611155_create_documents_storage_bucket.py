"""create documents storage bucket

Revision ID: fd66a6611155
Revises: 4fe258163b9a
Create Date: 2026-09-03 23:05:08.157101

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fd66a6611155"
down_revision: str | Sequence[str] | None = "4fe258163b9a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Private, unlike `avatars` — only SELECT is opened up (any authenticated
# user can read/download). There's deliberately no INSERT/UPDATE/DELETE
# policy: all writes go through backend-issued signed upload URLs using the
# service_role key, which bypasses RLS entirely, so `require_admin` on the
# endpoint that issues those URLs is the actual write gate, not RLS.
_UPGRADE_SQL = """
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false);

create policy "documents_authenticated_read"
on storage.objects for select
to authenticated
using (bucket_id = 'documents');
"""

_DOWNGRADE_SQL = """
drop policy if exists "documents_authenticated_read" on storage.objects;

delete from storage.objects where bucket_id = 'documents';
delete from storage.buckets where id = 'documents';
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(_DOWNGRADE_SQL)
