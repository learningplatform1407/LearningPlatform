# Supabase

Supabase project configuration (Auth providers, Storage buckets/policies,
database schema exports) lands here starting in Phase 1 (Identity and Account
Foundation).

## Auth: password recovery

There is no `config.toml` in this directory, so everything below except the
secret in §3 is set in the hosted dashboard and exists nowhere in the repo.
Each one fails _quietly_ when skipped, which is why they are written down.
Design rationale lives in
[`docs/architecture/password-reset.md`](../../docs/architecture/password-reset.md).

**To test the flow you need only §1 and §3** — one redirect URL and a locally
generated secret. §2 and §4 are production concerns and depend on each other:
Supabase gates email-template editing behind custom SMTP, which is exactly
why `/auth/confirm` accepts both link shapes rather than only the better one.

### 1. Redirect URL allow-list

`Authentication → URL Configuration → Redirect URLs`. One entry per web
origin, plus the mobile scheme:

```text
http://localhost:3000/auth/confirm
https://<preview-domain>/auth/confirm
https://<production-domain>/auth/confirm
learningplatform://reset-password
exp://**
```

**`exp://**` is for development on a device**, and it is easy to miss. In Expo
Go the app has no custom scheme of its own, so `Linking.createURL` produces
`exp://<lan-ip>:8081/--/reset-password` rather than `learningplatform://…`.
Without the wildcard entry, every reset tested through Expo Go is silently
redirected to the Site URL. `learningplatform://` only takes effect in a
development or production build.

A `redirectTo` that is not on this list is **ignored, not rejected** —
Supabase silently substitutes the Site URL, so the user lands on the dashboard
instead of the reset form and nothing in the logs says why.

The web `redirectTo` is derived from the request's `Host` header rather than a
`NEXT_PUBLIC_SITE_URL`, so previews work without extra configuration. This
allow-list is what makes that safe: a spoofed `Host` cannot send a recovery
token anywhere that is not listed here.

### 2. Recovery email template — only once you have custom SMTP

**Skip this to start.** Supabase gates template editing behind custom SMTP,
and `/auth/confirm` accepts both link shapes precisely so the feature works
before you get there:

| Template                                    | Needs SMTP | Link opened on another device |
| ------------------------------------------- | ---------- | ----------------------------- |
| default `{{ .ConfirmationURL }}` → `?code=` | no         | **fails**                     |
| custom `{{ .TokenHash }}`                   | yes        | works                         |

`@supabase/ssr` sets `flowType: "pkce"`, so the default template already
produces a working link — Supabase's verify endpoint redirects to
`/auth/confirm?code=…` and the route exchanges it. The limitation is that
PKCE keeps the code verifier in the cookies of the browser that _requested_
the reset, so "request on my laptop, click the link on my phone" fails with
"auth code and code verifier should be non-empty".

That is a normal way to use a password reset, so switch to the custom
template once SMTP is in place. No code change is needed — the route already
handles that arm.

#### The custom template

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
