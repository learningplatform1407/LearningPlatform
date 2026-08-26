# Task Split — Two-Person Backlog



This document is the execution backlog for building the remaining phases of `PLAN.md` as a two-person team working async(ish). `PLAN.md` stays the architecture reference; this doc is about sequencing, dependencies, and where the two of you need to sync up.



## How to use this doc



- **Anything without unmet dependencies is up for grabs.** Don't pre-assign whole epics to people — pick the next unblocked ticket that's free.

- **🔗 marks a sync point** — a ticket that needs a joint decision or a short pairing session, not solo work.

- **Migration coordination**: Alembic migrations are sequential (each new revision points at the previous one via `down_revision`). If you're both mid-migration at the same time, ping each other before running `alembic revision --autogenerate` — whoever merges second rebases their migration file on top of the new head.

- Tickets are grouped into epics with short prefixes (`UI-`, `NOTES-`, `DOCS-`, `STUDY-`, `AI-`, `HARDEN-`) so they read naturally as ticket keys if you copy them into an actual tracker.



## Epic: UI — Design Foundation



Gates every screen-building ticket below. Deliberately minimal — `PLAN.md` already scopes `packages/ui` to "truly cross-platform primitives," not a full shared component library, since web (DOM) and mobile (React Native) render too differently to share most components. What needs to be shared is the *look* (colors, spacing, type), not the code.



| Key | Summary | Depends on | Notes |

|---|---|---|---|

| **UI-1** 🔗 | Design tokens: color palette, spacing scale, type scale | — | ~30 min joint call. Shared constants exported from `packages/ui`, even without shared components. |

| **UI-2** | Web styling approach (Tailwind vs CSS modules vs plain CSS) using UI-1's tokens | UI-1 | Left unresolved since Phase 0 (Tailwind was explicitly skipped then). |

| **UI-3** | Mobile `StyleSheet` constants from UI-1's tokens | UI-1 | Mobile already uses plain `StyleSheet`; just centralize the values. |



## Epic: NOTES (Phase 2 — Notes & Local Sync)



| Key | Summary | Depends on | Notes |

|---|---|---|---|

| **NOTES-1** | `notes` table + migration | — | Client-generated id, server id, revision, `deleted_at` (soft delete for sync), timestamps. |

| **NOTES-2** 🔗 | `Note` schema in `packages/validation`/`packages/contracts` | — | Joint — the contract both the API and both clients build against. |

| **NOTES-3** | `GET/POST/PATCH/DELETE /v1/notes` CRUD API | NOTES-1, NOTES-2 | Mirrors the `/v1/me` ownership pattern already in `app/users/`. |

| **NOTES-4** | `POST /v1/notes/sync` — revision-based, idempotent | NOTES-3 | Last-write-wins + conflict copies, per `PLAN.md §9`. |

| **NOTES-5** | Local note store — SQLite (mobile) / IndexedDB (web) | NOTES-2 | Pure client-side storage — fully parallel to NOTES-1/3/4. |

| **NOTES-6** | Notes list/editor screens — web | NOTES-2, NOTES-5, UI-1/2 | Build against the local store first; wire to the real API in NOTES-8. |

| **NOTES-7** | Notes list/editor screens — mobile | NOTES-2, NOTES-5, UI-1/3 | Same, mobile. |

| **NOTES-8** 🔗 | Wire sync end-to-end (web + mobile → `/v1/notes/sync`) | NOTES-4, NOTES-6, NOTES-7 | Integration point — needs backend sync endpoint and both clients' local stores done. Good pairing candidate. |



## Epic: DOCS (Phase 3 — Documents & PDFs)



| Key | Summary | Depends on | Notes |

|---|---|---|---|

| **DOCS-1** | `documents` + `document_versions` tables + migration | — | |

| **DOCS-2** 🔗 | `Document` schema in `packages/validation`/`packages/contracts` | — | Joint. |

| **DOCS-3** 🔗 | Supabase Storage bucket + policies | — | One-time dashboard config, not code — share the bucket name/policy once done. |

| **DOCS-4** | `POST /v1/documents/upload-url` (signed upload URL) | DOCS-1, DOCS-3 | |

| **DOCS-5** | Register uploaded document + processing-status endpoint, file validation (size/MIME/checksum) | DOCS-4 | |

| **DOCS-6** | Upload UI — web | DOCS-2, UI-1/2 | Can build against a stubbed upload-url response before DOCS-4 is real. |

| **DOCS-7** | Upload UI — mobile | DOCS-2, UI-1/3 | Same. |

| **DOCS-8** | Document list/detail UI — web + mobile | DOCS-5, UI-1 | |



## Epic: STUDY (Phase 4 — Study Materials & Progress)



| Key | Summary | Depends on | Notes |

|---|---|---|---|

| **STUDY-1** | `courses`, `enrolments`, `study_materials`, `progress_records` tables + migration | — | |

| **STUDY-2** 🔗 | Course/Enrolment/Progress schemas | — | Joint. |

| **STUDY-3** | `GET /v1/study/courses` API | STUDY-1, STUDY-2 | Lists available + enrolled courses. |

| **STUDY-4** | `GET /v1/study/progress` + `PATCH /v1/study/progress/{material_id}` API | STUDY-3 | Enforce enrolment + plan entitlement via the existing `require_entitlement` dependency. |

| **STUDY-5** | Study dashboard UI — web | STUDY-2, UI-1/2 | Course list + progress view. |

| **STUDY-6** | Study dashboard UI — mobile | STUDY-2, UI-1/3 | |

| **STUDY-7** 🔗 | Wire enrolment/entitlement gating end-to-end | STUDY-4, STUDY-5, STUDY-6 | Integration point. |



## Epic: AI (Phase 5 — AI & Retrieval)



The one epic that isn't fully parallel from day one: real implementation work needs Documents processing (DOCS-5) reasonably stable first, since chunking/embeddings operate on extracted document text. Schema/planning tickets can still start early.



| Key | Summary | Depends on | Notes |

|---|---|---|---|

| **AI-1** | `document_chunks`, `embeddings`, `ai_conversations`, `ai_usage_events` tables + migration | DOCS-1 | Needs the `documents` table to exist for FKs. |

| **AI-2** 🔗 | AI query/conversation schemas | — | Joint, can happen anytime. |

| **AI-3** | Text extraction + chunking pipeline (background job) | DOCS-5, AI-1 | |

| **AI-4** | Vertex AI embeddings generation for chunks | AI-3 | |

| **AI-5** | Retrieval logic (vector search scoped to user/workspace) | AI-4 | |

| **AI-6** | `POST /v1/ai/query` + usage tracking/quotas | AI-5 | Via the existing `require_entitlement` dependency. |

| **AI-7** | `GET /v1/ai/conversations` | AI-6 | |

| **AI-8** | AI query UI — web | AI-6, UI-1/2 | |

| **AI-9** | AI query UI — mobile | AI-6, UI-1/3 | |

| **AI-10** 🔗 | Wire end-to-end + safety/input-limit review | AI-7, AI-8, AI-9 | Integration + safety review — pairing recommended. |



## Epic: HARDEN (Phase 6 — Production Hardening)



Cross-cutting, joint, and further out — kept lighter/indicative since scope will sharpen closer to the time.



| Key | Summary | Notes |

|---|---|---|

| **HARDEN-1** | Structured logging + request-ID middleware | Backend. |

| **HARDEN-2** | Audit events table + sensitive-action logging | |

| **HARDEN-3** | Backup/restore procedure, documented + tested | |

| **HARDEN-4** 🔗 | Security review — Auth, Storage policies, signed URL expiry, tenant isolation | Joint review session. |

| **HARDEN-5** | Load-test API + processing pipeline | |

| **HARDEN-6** | Evaluate Render → Cloud Run migration | Decision ticket, not necessarily code. |

| **HARDEN-7** | Client-side error tracking/monitoring | Web + mobile. |



## Suggested sequencing



- **Can start immediately, fully parallel**: UI-1, NOTES-1, NOTES-2, DOCS-1, DOCS-2, DOCS-3, STUDY-1, STUDY-2, AI-2.

- **UI-1 gates** every `-6/-7/-8`-style screen ticket across all epics — worth doing in the first sync call.

- **NOTES, DOCS, and STUDY epics have zero dependencies on each other** — genuinely parallelizable end-to-end.

- **AI epic's real work (AI-3 onward) waits on DOCS-5** — treat AI-1/AI-2 as prep you can do early, but don't expect to build the pipeline until Documents processing is stable.

- **HARDEN comes last**, after the feature epics, as joint work.
