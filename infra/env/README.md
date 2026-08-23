# Environment Variables

Each app documents its expected environment variables in a tracked
`.env.example` file; real values live only in untracked `.env`/`.env.local`
files or the deployment platform's secret store.

| File                        | Client-side safe (`NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`)                               | Server-only                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/.env.example`     | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | —                                                                                                                                        |
| `apps/mobile/.env.example`  | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | —                                                                                                                                        |
| `services/api/.env.example` | —                                                                                  | `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `CORS_ALLOWED_ORIGINS` |

Anything prefixed `NEXT_PUBLIC_`/`EXPO_PUBLIC_` is bundled into client code and
must never hold a secret. Service-role keys, JWT secrets, and AI project
credentials only ever live in `services/api`.
