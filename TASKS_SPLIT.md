# Task Split — Two-Person Backlog

This document is the execution backlog for building the remaining phases of `PLAN.md` as a two-person team working async(ish). `PLAN.md` stays the architecture reference; this doc is about sequencing, dependencies, and where the two of you need to sync up.

**Rewritten** to reflect the app's information architecture (left sidebar / bottom tab bar navigation with five sections: Lectures, AI Assistant, Roadmap, Feed, Profile) decided after the original version of this doc was written. See "App navigation" below before the epics — several existing epics (Notes, Documents, Study) got folded, renamed, or reframed to match.

## How to use this doc

- **Anything without unmet dependencies is up for grabs.** Don't pre-assign whole epics to people — pick the next unblocked ticket that's free.
- **🔗 marks a sync point** — a ticket that needs a joint decision or a short pairing session, not solo work.
- **Migration coordination**: Alembic migrations are sequential (each new revision points at the previous one via `down_revision`). If you're both mid-migration at the same time, ping each other before running `alembic revision --autogenerate` — whoever merges second rebases their migration file on top of the new head.
- Tickets are grouped into epics with short prefixes so they read naturally as ticket keys if you copy them into an actual tracker.

## App navigation

Five top-level sections, in this order: **Lectures, AI Assistant, Roadmap, Feed, Profile**.

- **Web and tablet**: a persistent left sidebar, collapsible. Lectures/AI Assistant/Roadmap/Feed are grouped together at the top; **Profile is pinned to the bottom of the sidebar, visually separated from the other four** (a spacer/divider between the two groups).
- **Phone**: a bottom tab bar with the same five items, in the same order.
- **Detection**: `useWindowDimensions()` with a breakpoint (~768px), not a static device-type check — this handles iPad split-screen/multitasking and orientation changes correctly, where "is this device a tablet" and "how much space is actually available right now" can disagree.
- Applies only to the authenticated app shell — `/login` and `/signup` (and their mobile equivalents) stay outside it, as today.
- **Lectures** has its own internal sub-tabs: **Materials** (PDFs), **Quizzes**, **Diagrams**.

**Scope decisions this triggered**:

- The original standalone **Notes** epic (freestanding note-taking, independent local-first sync) is **superseded**, not built — the actual need described was taking notes _on a lecture_ (margin notes, highlights, ink), which is a different, document-anchored concept, folded into the Lectures epic below.
- The original standalone **Study dashboard UI** (its own page) goes away — there's no separate menu item for it. `courses`/`enrolments`/`progress` remain as backend organizational structure (a course groups lectures together), surfaced _within_ the Lectures UI rather than its own section.
- **News** is renamed **Feed** throughout.
- **Quizzes** and **Diagrams** are real menu sub-tabs, but — like Roadmap — the product details haven't been discussed yet (question types? grading? what exactly is a "diagram," uploaded or generated?). Placeholder-only for now, same treatment as Roadmap, until that conversation happens.

## Epic: UI — Design Foundation ✅ Done

Tokens (`packages/ui`), Tailwind wiring (web), `theme.ts` (mobile), and a first styling pass on the existing auth/profile screens are all complete and committed.

## Epic: NAV — Adaptive Navigation Shell ✅ Done

Every section below lives inside this shell. Both platforms now have the full five-section structure (Lectures, AI Assistant, Roadmap, Feed, Profile) with placeholder content for the four new sections and the moved profile screen.

| Key          | Summary                             | Depends on   | Notes                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NAV-1**    | Web sidebar component               | UI-1         | ✅ `apps/web/src/components/sidebar.tsx`. Persistent, manually collapsible (shrinks to an icon rail). Lectures/AI Assistant/Roadmap/Feed grouped at top; Profile pinned to the bottom via `mt-auto`, separated by a border.                                       |
| **NAV-2**    | Tablet sidebar                      | NAV-1        | ✅ `apps/mobile/src/app/(app)/_layout.tsx`, `drawerType: "permanent"` via `expo-router/drawer`. No new dependency needed — Expo Router vendors its own React Navigation Drawer, and its runtime deps (`reanimated`/`worklets`/`gesture-handler`) were already installed. |
| **NAV-3**    | Phone bottom tab bar                | UI-1         | ✅ Same `(app)/_layout.tsx`, `expo-router/tabs`. Same five items, same order.                                                                                                                                                                                       |
| **NAV-4** 🔗 | Responsive breakpoint logic, shared | —            | ✅ 768px (`useWindowDimensions()` width), matching the iPad-portrait convention.                                                                                                                                                                                    |
| **NAV-5**    | Web route restructuring             | NAV-1        | ✅ Authenticated routes moved under an `(app)/` route group: `/lectures`, `/assistant`, `/roadmap`, `/feed`, `/profile`. Bare `/` redirects to `/lectures`.                                                                                                        |
| **NAV-6**    | Mobile route restructuring          | NAV-2, NAV-3 | ✅ Same idea under `apps/mobile/src/app/(app)/`: `lectures.tsx` (renamed from `index.tsx`), `assistant.tsx`, `roadmap.tsx`, `feed.tsx`, `profile.tsx`. Root `_layout.tsx`'s `Stack.Protected` now guards the whole `(app)` group as one entry.                     |

## Epic: LECTURES

**Reflow-first, not PDF-first** (supersedes the earlier PDF-fixed-layout framing): admins upload a PDF, the backend extracts its text once at upload time into heading/paragraph blocks, and students read/annotate a **reflowed** rendering of that text. The original fixed-layout PDF + freehand-ink mode (tablet-only, via a toggle) is explicitly deferred — real signal from this simpler version first. Quizzes/Diagrams sub-tabs stay reserved/unscoped (see below) — not wasted groundwork though, since the heading blocks extraction already produces are the natural future anchor points for chapter navigation and "which chapter is this quiz attached to."

Two real gaps surfaced while scoping this: there was no admin concept anywhere in the app (needed for upload-gating), and mobile has no built-in way to capture a text-selection range the way a browser's Selection API does (`Text` doesn't expose `onSelectionChange`, only `TextInput` does) — that gets its own spike before the mobile annotation UI is committed to.

### Admin role + document ingestion pipeline ✅ Done (backend)

| Key            | Summary                                                                  | Depends on | Notes                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LECTURES-0** | Admin role                                                               | —          | ✅ `role` column on `Profile` (`student`/`admin`), `require_admin` dependency. Promotion is manual for now (direct SQL) — no invite/promotion UI, matches how the `avatars` bucket itself was created.                                                                            |
| **LECTURES-1** | `documents` + `document_versions` tables + migration                    | —          | ✅ Includes `extracted_content` (JSON blocks: `{type: "heading"\|"paragraph", text, page}`) and a circular-FK `current_version_id`.                                                                                                                                                |
| **LECTURES-2** | `Document`/`DocumentVersion` schema in `packages/validation`/`contracts` | LECTURES-1 | ✅ Plus `packages/api-client` gained `listDocuments`/`getDocument`/`requestDocumentUploadUrl`/`createDocument`. Unit-tested at both layers (Zod parsing, and api-client request shape via a mocked `fetch`).                                                                       |
| **LECTURES-3** | Supabase Storage bucket + policies                                      | —          | ✅ Private `documents` bucket. SELECT open to any `authenticated` user; deliberately **no** INSERT/UPDATE/DELETE policy — all writes go through backend-issued signed upload URLs (service_role key bypasses RLS), so `require_admin` on that endpoint is the actual write gate. |
| **LECTURES-4** | `POST /v1/documents/upload-url` (signed upload URL)                     | LECTURES-3 | ✅ Verified against the actual `@supabase/storage-js` source for the exact REST call shape, and live-tested end-to-end against real Storage.                                                                                                                                       |
| **LECTURES-5** | Register uploaded document + extraction, file validation                | LECTURES-4 | ✅ `POST /v1/documents`. Extraction via PyMuPDF, synchronous (no task queue in this stack) — a font-size heuristic splits text into heading/paragraph blocks. **Also extracts embedded images** (a third `"image"` block type) — uploaded to Storage during processing, filtered by rendered on-page size (not source pixel size — a real bug caught by a unit test) to skip bullet icons/watermarks. Live-verified against real PDFs including one with an actual embedded image, correctly positioned in reading order.                |
| —              | `GET /v1/documents`, `GET /v1/documents/{id}`                           | LECTURES-5 | ✅ Any authenticated user (no course-gating yet — `STUDY-1` isn't built, so no per-course access control in v1).                                                                                                                                                                   |

### Reading UI + annotations — done on both platforms (mobile margin notes only, by design — see LECTURES-9)

| Key                | Summary                                          | Depends on              | Notes                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LECTURES-6**     | Upload UI — web                                  | LECTURES-2, UI-1         | ✅ Inline "Upload" button/form on `/lectures`, shown only when `role === "admin"`. Full client-side flow: `requestDocumentUploadUrl` → `supabase.storage.uploadToSignedUrl` → sha256 checksum (`src/lib/checksum.ts`) → `createDocument`. Live-verified through the real UI end-to-end (real PDF, real Storage, real extraction) with both an admin and a student account. |
| **LECTURES-7**     | Upload UI — mobile                               | LECTURES-2, UI-1         | ✅ `(app)/lectures/index.tsx` — same shape as web (FlatList + admin-only upload form), via new `expo-document-picker` + `expo-crypto` dependencies (SHA-256 checksum on-device since Hermes doesn't reliably expose Web Crypto's `crypto.subtle`, unlike browsers). Live-verified through the real exported app in a browser: real PDF, real Storage, real extraction, both phone and tablet nav intact after restructuring `lectures.tsx` into a `lectures/` folder. |
| **LECTURES-8**     | Reflow reader UI — web                           | LECTURES-2               | ✅ `(app)/lectures/[id]/page.tsx` — renders `extracted_content.blocks` as headings/paragraphs/images, handles processing/failed/ready states. Images render via a per-image signed URL (`ExtractedImage` component) since the `documents` bucket is private. No course grouping yet, flat list sorted newest-first.                                                                                                                                                              |
| **LECTURES-8b**    | Reflow reader UI — mobile                        | LECTURES-2               | ✅ `(app)/lectures/[id].tsx` — same shape as web, `Image` instead of `<img>` for extracted figures. Caught two real gaps along the way: a Jest `jest.mock()` hoisting rule needing `mock`-prefixed variable names, and test files placed directly under `(app)/lectures/` becoming real exported routes (Expo Router treats every `app/` file as a route unless it's under `__tests__/`) — moved into `(app)/lectures/__tests__/`.                                              |
| **LECTURES-9** 🔗  | Spike: mobile text-selection mechanics           | LECTURES-8b              | ✅ Came back genuinely uncertain: `TextInput` + `editable={false}` + `onSelectionChange` isn't a documented/supported combination (works only because `editable={false}` doesn't fully block interaction — RN issue #35418 — not an intended API), and there's no simulator/device in this sandbox to verify it end-to-end. Decision (user-selected via `AskUserQuestion`): mobile v1 ships **margin notes only** (long-press → modal, block-level anchoring, well-documented APIs only); inline highlight *creation* stays web-only. Mobile still **displays** highlights created on web (shared data) — not a full parity gap, since viewing is shared. |
| **LECTURES-10**    | `document_annotations` table + migration         | LECTURES-8               | ✅ `services/api/app/annotations/` — `document_annotations` table anchored to `(document_version_id, block_index, start_offset, end_offset)`, FK-cascaded from both `document_versions` and `profiles`. Type discriminator `highlight`/`margin_note` — `ink` stays a future third value, not built now. Caught and fixed the same FK-ordering bug class as `Subscription`/`require_admin` earlier in this project: annotation creation now calls `get_or_create_profile` before inserting, with a regression test covering a caller who's never hit `/v1/me`. |
| **LECTURES-11** 🔗 | Annotation schema, shared                        | LECTURES-10              | ✅ `annotationResponseSchema`/`annotationCreateRequestSchema` in `packages/validation`, `Annotation`/`AnnotationCreateRequest` types in `packages/contracts`, `listAnnotations`/`createAnnotation`/`deleteAnnotation` in `packages/api-client` (plus a `request<T>` fix to handle `204 No Content` DELETE responses without trying to parse an empty body as JSON). |
| **LECTURES-12**    | Highlight + margin-note UI — web                 | LECTURES-8, LECTURES-11  | ✅ `(app)/lectures/[id]/page.tsx` — native Selection/Range API, offsets computed via a `TreeWalker`-based utility (`src/lib/text-offset.ts`, same technique as Hypothesis). Floating toolbar (Highlight / Add note) positioned from `range.getBoundingClientRect()`. Highlights render as `<mark>`; margin notes (block-level or range-anchored) render as a small clickable "note" badge — a real segment-type bug caught and fixed here: `spliceAnnotations` originally rendered *any* annotation with offsets as a highlight, so a range-anchored margin note was showing as a highlight with no way to read its text. Live-verified end-to-end: real login, real upload, real highlight + note creation, persistence across a revisit, and per-user scoping (a second user sees zero of the first user's annotations). |
| **LECTURES-13**    | Highlight + margin-note UI — mobile              | LECTURES-9, LECTURES-11  | ✅ `(app)/lectures/[id].tsx` — long-press a paragraph (`Pressable` + `onLongPress`) opens a `Modal` for a block-level note (no offsets); existing highlights/margin notes (including ones created on web) render read-only via the same segment-splicing logic as web (`src/lib/text-offset.ts`, mobile variant), with all note badges shown below the paragraph rather than inline since RN `Text` can't nest a `Pressable` mid-flow the way web nests a `<span>`. Live-verified via the exported-web-build technique: real long-press → note creation → persists after revisiting; confirmed a highlight + range-anchored note created on web during the LECTURES-12 pass render correctly (read-only) on mobile. |

**Deferred, deliberately**: fixed-layout PDF + freehand-ink mode (tablet toggle), chapter/subchapter navigation, Quizzes, Diagrams. All noted above as real future work, none blocked by anything just built.

### Quizzes / Diagrams

Reserved sub-tabs, not scoped — needs its own product conversation (question types and grading for Quizzes; what a "diagram" actually is — uploaded image, AI-generated, or something else — for Diagrams) before writing real tickets.

## Epic: STUDY (backend only — no longer a separate page)

| Key            | Summary                                                                           | Depends on | Notes  |
| -------------- | --------------------------------------------------------------------------------- | ---------- | ------ |
| **STUDY-1**    | `courses`, `enrolments`, `study_materials`, `progress_records` tables + migration | —          |        |
| **STUDY-2** 🔗 | Course/Enrolment/Progress schemas                                                 | —          | Joint. |

(No dedicated UI tickets — this data now just informs how `LECTURES-8` groups materials, and gates access via the existing `require_entitlement` dependency.)

## Epic: PROFILE ✅ Done

| Key              | Summary                                                           | Depends on | Notes                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PROFILE-1**    | Edit form UI — web (`display_name`, `university`, avatar upload) | NAV-5      | ✅ `(app)/profile/page.tsx`. Real avatar upload (not just a URL field) — a new `avatars` Storage bucket + per-user-folder RLS policies, click-to-upload straight from the client to Supabase Storage, then `PATCH /v1/me` with the resulting public URL.                                                    |
| **PROFILE-2**    | Edit form UI — mobile                                             | NAV-6      | ✅ Same, via `expo-image-picker` (new dependency, SDK-locked to `~57.0.14`).                                                                                                                                                                                                                                  |
| **PROFILE-3** 🔗 | Decide + build settings editing (theme, notifications, language) | —          | ✅ Resolved as a separate **Settings** screen (not part of Profile) reachable via a gear-icon button on Profile — `(app)/settings` on both platforms, hidden from the main nav/tab bar/drawer. Also fixed the real bug this ticket flagged: `update_profile` was silently no-oping on settings fields since it did a blind `setattr(profile, field, value)` regardless of which model actually owns the field. Added a `language` column (`account_settings`, default `"en"`) for future i18n — persisted only, no i18n or dark-mode rendering built yet. |

## Epic: FEED (renamed from News)

| Key           | Summary                                        | Depends on     | Notes                                                                           |
| ------------- | ----------------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| **FEED-1**    | `feed_posts` table + migration                 | —              | `title`, `body`, `category` (news/exam/livestream), `link_url`, `published_at`. |
| **FEED-2** 🔗 | Feed post schema, shared                       | —              | Joint.                                                                           |
| **FEED-3**    | `GET /v1/feed` API (paginated, published only) | FEED-1, FEED-2 |                                                                                  |
| **FEED-4**    | Feed UI — web                                  | FEED-3, NAV-5  |                                                                                  |
| **FEED-5**    | Feed UI — mobile                               | FEED-3, NAV-6  |                                                                                  |

Not addressed yet: who authors feed posts. No admin/CMS UI planned — direct DB inserts are fine until that's actually a pain point.

## Epic: ROADMAP (placeholder only)

| Key           | Summary                              | Depends on   | Notes                                                                                                                  |
| ------------- | ------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **ROADMAP-1** | Reserve the menu item + route/screen | NAV-5, NAV-6 | Empty/"coming soon" placeholder. The actual gamification/milestone concept is a separate future planning conversation. |

## Epic: AI (Phase 5 — AI & Retrieval)

Explicitly lowest priority — described as a future implementation. Real work also waits on Lectures' Materials processing (`LECTURES-5`) being stable, since chunking/embeddings operate on extracted document text.

| Key          | Summary                                                                                   | Depends on       | Notes                                              |
| ------------ | ------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| **AI-1**     | `document_chunks`, `embeddings`, `ai_conversations`, `ai_usage_events` tables + migration | LECTURES-1       | Needs the `documents` table to exist for FKs.      |
| **AI-2** 🔗  | AI query/conversation schemas                                                             | —                | Joint, can happen anytime.                         |
| **AI-3**     | Text extraction + chunking pipeline (background job)                                      | LECTURES-5, AI-1 |                                                     |
| **AI-4**     | Vertex AI embeddings generation for chunks                                                | AI-3             |                                                     |
| **AI-5**     | Retrieval logic (vector search scoped to user/workspace)                                  | AI-4             |                                                     |
| **AI-6**     | `POST /v1/ai/query` + usage tracking/quotas                                               | AI-5             | Via the existing `require_entitlement` dependency. |
| **AI-7**     | `GET /v1/ai/conversations`                                                                | AI-6             |                                                     |
| **AI-8**     | AI Assistant chat UI — web                                                                | AI-6, NAV-5      |                                                     |
| **AI-9**     | AI Assistant chat UI — mobile                                                             | AI-6, NAV-6      |                                                     |
| **AI-10** 🔗 | Wire end-to-end + safety/input-limit review                                               | AI-7, AI-8, AI-9 | Integration + safety review — pairing recommended. |

## Epic: HARDEN (Phase 6 — Production Hardening)

Cross-cutting, joint, and further out — kept lighter/indicative since scope will sharpen closer to the time.

| Key             | Summary                                                                       | Notes                                  |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| **HARDEN-1**    | Structured logging + request-ID middleware                                    | Backend.                               |
| **HARDEN-2**    | Audit events table + sensitive-action logging                                 |                                         |
| **HARDEN-3**    | Backup/restore procedure, documented + tested                                 |                                         |
| **HARDEN-4** 🔗 | Security review — Auth, Storage policies, signed URL expiry, tenant isolation | Joint review session.                  |
| **HARDEN-5**    | Load-test API + processing pipeline                                           |                                         |
| **HARDEN-6**    | Evaluate Render → Cloud Run migration                                         | Decision ticket, not necessarily code. |
| **HARDEN-7**    | Client-side error tracking/monitoring                                         | Web + mobile.                          |

## Suggested sequencing

1. **NAV** first — everything else lives inside this shell, and it's a real restructuring of routes that already exist. ✅ Done.
2. **LECTURES → admin role + document ingestion pipeline** (`LECTURES-0` through `-5`) ✅ Done, live-verified against real Supabase Storage.
3. **LECTURES-2** (shared schema) ✅ Done.
4. **LECTURES-6/8** (web upload UI + reflow reader) ✅ Done, live-verified through the real UI with an admin and a student account.
5. **LECTURES-7/8b** (mobile upload UI + reflow reader) ✅ Done, live-verified.
6. **LECTURES-9** (mobile text-selection spike) ✅ Done — came back uncertain, mobile v1 scoped to margin notes only (see notes above).
7. **LECTURES-10/11/12/13** (annotations schema + highlight/margin-note UI) ✅ Done, live-verified on both platforms including cross-platform annotation visibility and per-user scoping.
8. **PROFILE** and **FEED** are both small and independent of Lectures — good filler work or a second parallel track. PROFILE is done; FEED is still open.
9. **ROADMAP-1** is trivial, do it whenever.
10. **AI** last, and only once `LECTURES-5` (Materials processing) is stable — it already is.
11. **HARDEN** after the feature epics, as joint work.
