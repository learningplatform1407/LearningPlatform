# Supabase

Supabase project configuration (Auth providers, Storage buckets/policies,
database schema exports) lands here starting in Phase 1 (Identity and Account
Foundation).

## Auth: password recovery

There is no `config.toml` in this directory, so all three of these are set in
the hosted dashboard and exist nowhere in the repo. Each one fails _quietly_
when skipped, which is why they are written down. Design rationale lives in
[`docs/architecture/password-reset.md`](../../docs/architecture/password-reset.md).

### 1. Redirect URL allow-list

`Authentication → URL Configuration → Redirect URLs`. One entry per web
origin, plus the mobile scheme:

```text
http://localhost:3000/auth/confirm
https://<preview-domain>/auth/confirm
https://<production-domain>/auth/confirm
learningplatform://reset-password
```

A `redirectTo` that is not on this list is **ignored, not rejected** —
Supabase silently substitutes the Site URL, so the user lands on the dashboard
instead of the reset form and nothing in the logs says why.

The web `redirectTo` is derived from the request's `Host` header rather than a
`NEXT_PUBLIC_SITE_URL`, so previews work without extra configuration. This
allow-list is what makes that safe: a spoofed `Host` cannot send a recovery
token anywhere that is not listed here.

### 2. Recovery email template

`Authentication → Email Templates → Reset Password`. The default body uses
`{{ .ConfirmationURL }}`, which assumes the client-side hash-fragment flow.
This app keeps its session in cookies (`@supabase/ssr`), so the link has to
reach the `/auth/confirm` route handler with a token hash instead:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery"> Set a new password </a>
```

Leave the default in place and the link appears to work, drops the user on the
site root with no session, and gives no clue that the template is the problem.

**`{{ .RedirectTo }}`, not `{{ .SiteURL }}/auth/confirm`.** The action passes
`redirectTo` built from the request's own host, which is what lets local and
preview deployments work; a template hardcoded to `{{ .SiteURL }}` discards
that and sends every reader to production, so a reset begun on a preview
would hand them a production link. `.RedirectTo` already carries
`?next=/reset-password`, which is why the token parameters are appended with
`&`.

### 3. `RECOVERY_MARKER_SECRET` (repo-side, not Supabase)

Not a dashboard setting, but it belongs in the same checklist because the
recovery flow throws without it. `/reset-password` changes a password without
asking for the current one, so it is gated on proof that the session came from
a recovery link — an HMAC over the user id and an expiry, signed with this
secret. See `apps/web/src/lib/recovery-cookie.ts` for why a plain flag is not
enough.

**Server-only. Never `NEXT_PUBLIC_`** — that prefix inlines a value into the
client bundle, which would publish the signing key and make the marker
forgeable by anyone who reads the JavaScript.

```bash
# apps/web/.env.local, and the deployment's env
RECOVERY_MARKER_SECRET=$(openssl rand -hex 32)
```

Rotating it invalidates any reset in flight: those readers get sent to
`/settings/account` and have to request a fresh link. Harmless, but it is why
rotation is not free.

### 4. Custom SMTP

`Project Settings → Authentication → SMTP Settings`. **Resend** is the chosen
provider. The built-in sender allows a handful of messages per hour and is
documented as unsuitable for production: it is enough to test with, and then
throttles real users without surfacing an error they can act on.

The sending domain has to be verified with Resend before mail reaches
arbitrary addresses. The same credentials will serve the notification emails
that `settings/notifications`' `notifications_enabled` flag currently promises
and nothing yet delivers.

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
