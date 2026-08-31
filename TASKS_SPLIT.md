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

Absorbs the original **Documents** epic (Materials sub-tab) and adds the annotation work discussed for reading/marking up PDFs. Quizzes and Diagrams sub-tabs are reserved but not scoped yet (see above).

### Materials (PDFs) — carried over from the original Documents epic

| Key               | Summary                                                                                       | Depends on             | Notes                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **LECTURES-1**    | `documents` + `document_versions` tables + migration                                          | —                      |                                                                                                                        |
| **LECTURES-2** 🔗 | `Document` schema in `packages/validation`/`packages/contracts`                               | —                      | Joint.                                                                                                                 |
| **LECTURES-3** 🔗 | Supabase Storage bucket + policies                                                            | —                      | One-time dashboard config, not code — share the bucket name/policy once done.                                          |
| **LECTURES-4**    | `POST /v1/documents/upload-url` (signed upload URL)                                           | LECTURES-1, LECTURES-3 |                                                                                                                        |
| **LECTURES-5**    | Register uploaded document + processing-status endpoint, file validation (size/MIME/checksum) | LECTURES-4             |                                                                                                                        |
| **LECTURES-6**    | Upload UI — web                                                                               | LECTURES-2, UI-1       | Can build against a stubbed upload-url response before LECTURES-4 is real.                                             |
| **LECTURES-7**    | Upload UI — mobile                                                                            | LECTURES-2, UI-1       | Same.                                                                                                                  |
| **LECTURES-8**    | Materials list/detail UI (Lectures → Materials sub-tab) — web + mobile                        | LECTURES-5, NAV-5/6    | Group by course where `courses`/`study_materials` data exists — this is where the old Study dashboard's job lives now. |

### Reading + annotations

The PDF needs to render as real fixed pages (not reflowed text) for highlights, margin notes, and freehand ink to have stable positions to anchor to — see the earlier discussion on reflow vs. fixed layout.

| Key                | Summary                                                                 | Depends on              | Notes                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LECTURES-9** 🔗  | Spike: validate PDF rendering + selectable text layer on both platforms | LECTURES-8              | Web (`pdf.js`) is mature; mobile's equivalent needs verifying against current library docs before committing — the exact library choice is unconfirmed. Do this before scoping the rest below in detail.                                     |
| **LECTURES-10**    | `document_annotations` table + migration                                | LECTURES-9              | Type discriminator: `highlight` (page + text range + color), `margin_note` (page + position + text), `ink` (page + vector stroke data).                                                                                                      |
| **LECTURES-11** 🔗 | Annotation schema, shared                                               | LECTURES-10             | Joint — the three sub-types need agreement before either platform builds against it.                                                                                                                                                         |
| **LECTURES-12**    | Highlight/underline UI — web                                            | LECTURES-9, LECTURES-11 |                                                                                                                                                                                                                                              |
| **LECTURES-13**    | Highlight/underline UI — mobile                                         | LECTURES-9, LECTURES-11 |                                                                                                                                                                                                                                              |
| **LECTURES-14**    | Margin notes UI — web + mobile                                          | LECTURES-11             | This is where "notes on a lecture" actually lives now, instead of the superseded standalone Notes epic.                                                                                                                                      |
| **LECTURES-15**    | Freehand ink annotation — mobile (tablet-focused)                       | LECTURES-9, LECTURES-11 | Highest-risk, most novel ticket. Likely `@shopify/react-native-skia` for the drawing canvas — new dependency, not yet installed. Not gated to tablet devices specifically (a finger can draw too), but tablet is where it's actually usable. |

### Quizzes / Diagrams

Reserved sub-tabs, not scoped — needs its own product conversation (question types and grading for Quizzes; what a "diagram" actually is — uploaded image, AI-generated, or something else — for Diagrams) before writing real tickets.

## Epic: STUDY (backend only — no longer a separate page)

| Key            | Summary                                                                           | Depends on | Notes  |
| -------------- | --------------------------------------------------------------------------------- | ---------- | ------ |
| **STUDY-1**    | `courses`, `enrolments`, `study_materials`, `progress_records` tables + migration | —          |        |
| **STUDY-2** 🔗 | Course/Enrolment/Progress schemas                                                 | —          | Joint. |

(No dedicated UI tickets — this data now just informs how `LECTURES-8` groups materials, and gates access via the existing `require_entitlement` dependency.)

## Epic: PROFILE ✅ Done

| Key              | Summary                                                         | Depends on | Notes                                                                                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PROFILE-1**    | Edit form UI — web (`display_name`, `university`, avatar upload) | NAV-5      | ✅ `(app)/profile/page.tsx`. Real avatar upload (not just a URL field) — a new `avatars` Storage bucket + per-user-folder RLS policies, click-to-upload straight from the client to Supabase Storage, then `PATCH /v1/me` with the resulting public URL.                                                    |
| **PROFILE-2**    | Edit form UI — mobile                                           | NAV-6      | ✅ Same, via `expo-image-picker` (new dependency, SDK-locked to `~57.0.14`).                                                                                                                                                                                                                                  |
| **PROFILE-3** 🔗 | Decide + build settings editing (theme, notifications, language) | —          | ✅ Resolved as a separate **Settings** screen (not part of Profile) reachable via a gear-icon button on Profile — `(app)/settings` on both platforms, hidden from the main nav/tab bar/drawer. Also fixed the real bug this ticket flagged: `update_profile` was silently no-oping on settings fields since it did a blind `setattr(profile, field, value)` regardless of which model actually owns the field. Added a `language` column (`account_settings`, default `"en"`) for future i18n — persisted only, no i18n or dark-mode rendering built yet. |

## Epic: FEED (renamed from News)

| Key           | Summary                                        | Depends on     | Notes                                                                           |
| ------------- | ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------- |
| **FEED-1**    | `feed_posts` table + migration                 | —              | `title`, `body`, `category` (news/exam/livestream), `link_url`, `published_at`. |
| **FEED-2** 🔗 | Feed post schema, shared                       | —              | Joint.                                                                          |
| **FEED-3**    | `GET /v1/feed` API (paginated, published only) | FEED-1, FEED-2 |                                                                                 |
| **FEED-4**    | Feed UI — web                                  | FEED-3, NAV-5  |                                                                                 |
| **FEED-5**    | Feed UI — mobile                               | FEED-3, NAV-6  |                                                                                 |

Not addressed yet: who authors feed posts. No admin/CMS UI planned — direct DB inserts are fine until that's actually a pain point.

## Epic: ROADMAP (placeholder only)

| Key           | Summary                              | Depends on   | Notes                                                                                                                  |
| ------------- | ------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **ROADMAP-1** | Reserve the menu item + route/screen | NAV-5, NAV-6 | Empty/"coming soon" placeholder. The actual gamification/milestone concept is a separate future planning conversation. |

## Epic: AI (Phase 5 — AI & Retrieval)

Explicitly lowest priority — described as a future implementation. Real work also waits on Lectures' Materials processing (`LECTURES-5`) being stable, since chunking/embeddings operate on extracted document text.

| Key          | Summary                                                                                   | Depends on       | Notes                                              |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------- |
| **AI-1**     | `document_chunks`, `embeddings`, `ai_conversations`, `ai_usage_events` tables + migration | LECTURES-1       | Needs the `documents` table to exist for FKs.      |
| **AI-2** 🔗  | AI query/conversation schemas                                                             | —                | Joint, can happen anytime.                         |
| **AI-3**     | Text extraction + chunking pipeline (background job)                                      | LECTURES-5, AI-1 |                                                    |
| **AI-4**     | Vertex AI embeddings generation for chunks                                                | AI-3             |                                                    |
| **AI-5**     | Retrieval logic (vector search scoped to user/workspace)                                  | AI-4             |                                                    |
| **AI-6**     | `POST /v1/ai/query` + usage tracking/quotas                                               | AI-5             | Via the existing `require_entitlement` dependency. |
| **AI-7**     | `GET /v1/ai/conversations`                                                                | AI-6             |                                                    |
| **AI-8**     | AI Assistant chat UI — web                                                                | AI-6, NAV-5      |                                                    |
| **AI-9**     | AI Assistant chat UI — mobile                                                             | AI-6, NAV-6      |                                                    |
| **AI-10** 🔗 | Wire end-to-end + safety/input-limit review                                               | AI-7, AI-8, AI-9 | Integration + safety review — pairing recommended. |

## Epic: HARDEN (Phase 6 — Production Hardening)

Cross-cutting, joint, and further out — kept lighter/indicative since scope will sharpen closer to the time.

| Key             | Summary                                                                       | Notes                                  |
| --------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| **HARDEN-1**    | Structured logging + request-ID middleware                                    | Backend.                               |
| **HARDEN-2**    | Audit events table + sensitive-action logging                                 |                                        |
| **HARDEN-3**    | Backup/restore procedure, documented + tested                                 |                                        |
| **HARDEN-4** 🔗 | Security review — Auth, Storage policies, signed URL expiry, tenant isolation | Joint review session.                  |
| **HARDEN-5**    | Load-test API + processing pipeline                                           |                                        |
| **HARDEN-6**    | Evaluate Render → Cloud Run migration                                         | Decision ticket, not necessarily code. |
| **HARDEN-7**    | Client-side error tracking/monitoring                                         | Web + mobile.                          |

## Suggested sequencing

1. **NAV** first — everything else lives inside this shell, and it's a real restructuring of routes that already exist.
2. **LECTURES → Materials** (`LECTURES-1` through `-8`) — the core value of the app, fully parallelizable internally.
3. **LECTURES-9** (the rendering/annotation spike) as soon as Materials is far enough along to have a real document to test against — don't commit to the rest of the annotation tickets until this comes back.
4. **PROFILE** and **FEED** are both small and independent of Lectures — good filler work or a second parallel track while Lectures is in progress.
5. **ROADMAP-1** is trivial, do it whenever.
6. **AI** last, and only once `LECTURES-5` (Materials processing) is stable.
7. **HARDEN** after the feature epics, as joint work.
