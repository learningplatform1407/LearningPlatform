# Supabase

Supabase project configuration (Auth providers, Storage buckets/policies,
database schema exports) lands here starting in Phase 1 (Identity and Account
Foundation).

**Storage buckets live in Alembic migrations, not here.** `storage.buckets` and
`storage.objects` are Supabase-managed tables with no ORM model, so each bucket
is created by a revision of raw SQL. Three exist:

| Bucket        | Revision       | Read                   | Client write        | Write gate                                 |
| ------------- | -------------- | ---------------------- | ------------------- | ------------------------------------------ |
| `avatars`     | `5cbe88540ef8` | public                 | own folder, via RLS | RLS (`foldername[1] = auth.uid()`)         |
| `documents`   | `fd66a6611155` | `authenticated` select | none                | `require_admin` on the signed-URL endpoint |
| `feed-images` | `c93f08b5d174` | public                 | none                | `require_admin` on the signed-URL endpoint |

RLS has no admin concept, which is why the latter two open no write policy at
all and rely on the service_role key behind an admin-gated endpoint instead.
See [`docs/architecture/feed.md`](../../docs/architecture/feed.md) for why
`feed-images` pairs public read with no client write, and why it is the only
one carrying `file_size_limit`/`allowed_mime_types`.
