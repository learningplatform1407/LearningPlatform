"""create avatars storage bucket

Revision ID: 5cbe88540ef8
Revises: be7a4e51e577
Create Date: 2026-08-31 23:09:52.557304

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5cbe88540ef8"
down_revision: str | Sequence[str] | None = "be7a4e51e577"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# storage.buckets/storage.objects are Supabase-managed tables (not app models,
# no ORM Base for them) — plain SQL here, same idea as the auth.users shell
# table but in the other direction.
_UPGRADE_SQL = """
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "avatars_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "avatars_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
"""

_DOWNGRADE_SQL = """
drop policy if exists "avatars_owner_delete" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_public_read" on storage.objects;

delete from storage.objects where bucket_id = 'avatars';
delete from storage.buckets where id = 'avatars';
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(_DOWNGRADE_SQL)
