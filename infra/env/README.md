# Environment Variables

This page is the list of environment variables each app expects. Create the
local file named in the first column and set the variables listed for it; real
values live only in those untracked files or the deployment platform's secret
store. When a change adds or removes a variable, update this table in the same
PR.

| Local file            | Client-side safe (`NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`)                               | Server-only                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `RECOVERY_MARKER_SECRET`                                                                                                                                             |
| `apps/mobile/.env`    | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | —                                                                                                                                                                    |
| `services/api/.env`   | —                                                                                  | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `CORS_ALLOWED_ORIGINS`, `INSTITUTION_TIMEZONE`, `APP_ENV` |

Anything prefixed `NEXT_PUBLIC_`/`EXPO_PUBLIC_` is bundled into client code and
must never hold a secret. Service-role keys and AI project credentials only
ever live in `services/api`.

`RECOVERY_MARKER_SECRET` signs the web app's password-reset cookie; generate
it as described in `infra/supabase/README.md` §3. `APP_ENV=development` turns on
debug logging in `services/api`; leave it unset elsewhere.

`services/api` verifies Supabase-issued JWTs against Supabase's public JWKS
endpoint (derived from `SUPABASE_URL`), not a shared secret — there is no
`SUPABASE_JWT_SECRET` to configure.

`INSTITUTION_TIMEZONE` is the one setting here with a **working default**
(`Europe/Bucharest`), so it is optional to set and the app starts without it.
That is deliberate: it names the timezone the question of the day rolls over
in, and "unset" would have to mean _some_ zone anyway — silently the host's,
which is how a server move changes what day it is for everyone. Set it
explicitly in any deployment you care about. It must be an IANA zone name that
`zoneinfo` can resolve; see `docs/architecture/daily-question.md`.
