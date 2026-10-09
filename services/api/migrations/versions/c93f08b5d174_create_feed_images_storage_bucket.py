"""create feed-images storage bucket

Revision ID: c93f08b5d174
Revises: 4b1d7ea3c602
Create Date: 2026-10-09 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c93f08b5d174"
down_revision: str | Sequence[str] | None = "4b1d7ea3c602"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# storage.buckets/storage.objects are Supabase-managed tables (not app models,
# no ORM Base for them) — plain SQL here, same as 5cbe88540ef8 and fd66a6611155.
#
# A third bucket shape, and the pairing is the point. Both halves already exist
# separately in this schema; only the combination is new.
#
# public = true, like `avatars`: the read URL is stable and never expires. That
# is the deciding factor. The private alternative would mean
# createSignedUrl(path, 3600), and neither client refreshes an expiring signed
# URL (see ExtractedImage on web and mobile) — so images would silently 403
# after an hour on the one screen people leave open. There is also nothing to
# protect: announcements are for the whole user base.
#
# No INSERT/UPDATE/DELETE policy at all, like `documents`: writes go only
# through backend-minted signed upload URLs using the service_role key, which
# bypasses RLS, so require_admin on POST /v1/feed/image-upload-url is the
# actual write gate. Copying `avatars`' per-user-folder write policy instead
# would let *any* authenticated learner write into feed-images/{their_uid}/ —
# they could not create a post, but that is unpoliced storage against a shared
# quota from any signed-up account. RLS has no admin concept to express the
# real rule with.
#
# file_size_limit and allowed_mime_types are new here — neither existing bucket
# sets them. Justified: the API's size_bytes/mime_type checks are
# client-declared and therefore advisory, and unlike `documents` there is no
# re-download-and-checksum step afterwards to catch a bad upload (none is
# wanted: no processing pipeline, no integrity requirement for a decorative
# image). So the bucket is the only limit a client holding a signed URL cannot
# route around, and it has to do the enforcing.
_UPGRADE_SQL = """
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feed-images', 'feed-images', true, 5242880,
        array['image/jpeg','image/png','image/webp']);

create policy "feed_images_public_read"
on storage.objects for select
using (bucket_id = 'feed-images');
"""

_DOWNGRADE_SQL = """
drop policy if exists "feed_images_public_read" on storage.objects;

delete from storage.objects where bucket_id = 'feed-images';
delete from storage.buckets where id = 'feed-images';
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(_DOWNGRADE_SQL)
