# Environment Variables

Each app documents its expected environment variables in a tracked
`.env.example` file; real values live only in untracked `.env`/`.env.local`
files or the deployment platform's secret store.

| File                        | Client-side safe (`NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`)                               | Server-only                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/.env.example`     | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | —                                                                                                                                         |
| `apps/mobile/.env.example`  | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | —                                                                                                                                         |
| `services/api/.env.example` | —                                                                                  | `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `CORS_ALLOWED_ORIGINS`, `INSTITUTION_TIMEZONE` |

Anything prefixed `NEXT_PUBLIC_`/`EXPO_PUBLIC_` is bundled into client code and
must never hold a secret. Service-role keys and AI project credentials only
ever live in `services/api`.

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
