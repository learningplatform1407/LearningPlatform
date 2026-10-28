# Architecture

The authoritative source for architecture decisions, repository structure, data
model, and the staged build order is [`/PLAN.md`](../../PLAN.md).

Architecture decision records (ADRs) and diagrams land in this directory as
the system grows.

- [`quizzes.md`](./quizzes.md) — question bank, tag filtering, and timed/pausable
  quiz sessions. Settles the question shape and grading model that
  `TASKS_SPLIT.md` deferred, and records the seam a future global exam fits
  through.
- [`flashcards.md`](./flashcards.md) — per-lesson spaced-repetition cards, the
  official/personal provenance axis, and why a flashcard owns its own text
  rather than pointing at a question from the exam pool.
- [`feed.md`](./feed.md) — admin-authored announcements. Records the two places
  the feed deliberately diverges from flashcards (edit/delete is role-based,
  not ownership-based; `author_id` is `SET NULL`, not `CASCADE`), why there is
  no `link_url` column, and the public-read/no-client-write shape of the
  `feed-images` bucket.
- [`daily-question.md`](./daily-question.md) — one question per calendar day,
  drawn lazily by the day's first reader. Settles the institution-timezone
  model and why not per-user, why `attempt`-is-null-or-reveal is the whole
  privacy story, why the answer endpoint carries no date, and why a daily
  answer stays out of `question_progress`.
- [`password-reset.md`](./password-reset.md) — email recovery and
  change-password, both pure Supabase Auth with no backend involvement.
  Records why the form deliberately cannot say whether an address is
  registered, why `/reset-password` is **not** a public path while
  `/auth/confirm` is, why mobile needs a third `Stack.Protected` branch, and
  what has to be configured in the Supabase dashboard for any of it to work.

## Where admin authoring lives

Admin content tools stay **contextual-inline on mobile**, next to the content
they create: books and chapters on `/learn/library`, lecture upload inside the
book you are viewing. On web this was the rule for everything until library
authoring moved out (see the fourth exception below) — the feed composer, the
two bulk importers, and question-of-the-day still follow it as described here.

The two exceptions are the bulk JSON importers (`/question-bank/manage`,
`/learn/flashcards/manage`), because a dry-run-then-commit workflow does not
fit inline, and they are web-only by design.

The question-of-the-day schedule (`/admin/question-of-the-day`) is the **third
exception**, and it is worth recording as one rather than leaving it to look
like drift. A per-day assignment could have gone inline in the `/learn`
overlay, next to the day it changes. It did not, because planning a fortnight
ahead wants every day in one view, and an overlay scoped to a single day cannot
give that. The consequence is the same trade the importers make: **mobile
admins cannot override.** Learners get the full feature on both platforms.

The feed composer on `/feed` **is** the contextual-inline rule rather than a
third exception: it sits directly above the list it writes into, on both
platforms, and is gated on `me.data?.role === "admin"` like every other inline
admin form.

Library authoring (books, chapters, sub-chapters, lecture uploads) is the
**fourth exception, and web-only**: the four inline forms that used to live on
`/learn/library` and `/learn/library/[bookId]` (gated on
`me.data?.role === "admin"`) moved to new `/admin/library` and
`/admin/library/[bookId]` routes instead, because having those forms render
for an admin browsing the same pages every learner uses put create/upload
controls in front of people they were never meant for. The regular Library
pages now hide them unconditionally — admin or not. The browsing components
(book grid, chapter list, sub-chapter list, lesson list) are reused as-is via
a `showAdminTools` prop rather than duplicated, so there is still exactly one
copy of each form; it is just reached from `/admin/library` instead of
rendered inline. Mobile was not touched, so its library screens still have
the forms inline — the inverse of the importers/question-of-the-day
asymmetry above: **mobile admins can create/upload there and web admins
cannot**, until mobile gets the same treatment.

`/admin` is a directory for the importers and question-of-the-day, and now
also hosts library authoring itself at `/admin/library` — which still
re-implements nothing, since it renders the same book-grid/chapter-tree
component the regular Library pages use, just with `showAdminTools` forced on
after its own role gate.
