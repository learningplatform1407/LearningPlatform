# Flashcards

Per-lesson spaced-repetition cards, in two flavours: **official** cards an admin bulk-imports for
everyone, and **personal** cards a learner writes for themselves. Both share one due queue and one
scheduler.

## 1. Why

The `flashcards` table has existed since `d59e08b4c331` as a shell: free-text `front_text` /
`back_text` hanging off `documents.id`, with a read-only list endpoint, no write path, no authoring
UI, and therefore no rows in any environment. Both platforms rendered "Coming soon." over it.

Review (cloze deletion over the lesson text) already proved the spaced-repetition half of the
product works. What it cannot do is cover anything the lecture does not literally say — definitions
you want phrased your own way, mnemonics, or an admin's curated "the ten things to remember from
this lecture". That is what flashcards are for.

## 2. Core idea

A flashcard **owns its own front and back text**. It is deliberately _not_ a `Question`.

An earlier design drew flashcards from the question bank at random per lecture, which reads
attractively — the content already exists and is already lesson-scoped. It was dropped because the
question bank is exam material. `QuestionBankItem` omits `correct_option_ids`, `rationales` and
`explanation`, and its docstring calls that omission "the entire safety story" for keeping answer
keys away from students outside `/results` (§7.1 of [`quizzes.md`](./quizzes.md)). A flashcard whose
whole interaction is "tap to see the answer" cannot honour that. Reusing the pool would have meant
either breaking the invariant or bolting on a per-card reveal endpoint gated on deck membership —
machinery that exists only to work around the mismatch.

With flashcards owning their text, the exam pool stays exam-only and **there is no answer key to
protect**: the deck ships front and back together, and the client simply doesn't render the back
until tapped.

## 3. Decisions

| Decision                                                                 | Rationale                                                                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Own front/back text, no `question_id`                                    | §2. The exam pool stays exam-only.                                                                                            |
| One `flashcard_review_states` table, separate from `cloze_review_states` | Each feature owns its content table; the only thing worth sharing is the scheduling math.                                     |
| `app/srs/scheduler.py` shared, unchanged                                 | SM-2 was already pure and dependency-free. A third card type means a third state table, never a second copy of the algorithm. |
| `scope` stored, never derived from role                                  | §5.2. The decision this doc most exists to record.                                                                            |
| Official and personal in one queue, with a filter                        | Two queues would mean two "caught up" states and two schedules for one lesson.                                                |
| Admin authoring is bulk JSON import only                                 | Same shape as the question importer, which is already trusted. No single-card admin form.                                     |
| Deck order is due-first then random                                      | `order_index` orders the management list; studying is driven by the schedule and then by chance.                              |

## 4. Data model

### 4.1 `flashcards`

Extends the existing table (`app/flashcards/models.py`).

| column                     | notes                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| `id`                       | UUID PK                                                              |
| `document_id`              | FK `documents.id` CASCADE, **required** — the lecture binding        |
| `external_id`              | unique, nullable. The import's upsert key; `NULL` for personal cards |
| `scope`                    | `official` \| `personal` — see §5.2                                  |
| `status`                   | `draft` \| `published` \| `archived`, mirroring `questions.status`   |
| `front_text`, `back_text`  | the card                                                             |
| `order_index`              | orders the management list, **not** the deck                         |
| `created_by`               | FK `profiles.id` CASCADE — audit trail, not classification           |
| `created_at`, `updated_at` |                                                                      |

Indexes: `(document_id, scope, status)` for the deck query and the lesson list, which filter on
exactly that triple; `(created_by, scope)` for "my cards".

### 4.2 `flashcard_review_states`

Mirrors `cloze_review_states` column for column with `flashcard_id` in place of `cloze_card_id`:
`ease_factor` (default 2.5), `interval_days` (0), `repetitions` (0), `suspended` (false), `due_at`,
`last_reviewed_at`, unique on `(user_id, flashcard_id)`.

Rows are created **lazily on first grade** (or on first suspension — §5.5), never pre-seeded at
import time, so **"new" means no row _or_ a row that has never been graded**, which is why
`last_reviewed_at IS NULL` and not just row-absence is the test. One table covers official and personal cards alike, which is why
the All / Official / Mine toggle narrows the view without splitting the schedule.

### 4.3 What was dropped

`quizzes` goes with this migration (QUIZ-11). It was the other shell record from the
pre-question-bank design; it lost its last reader when the mobile lesson tab moved to the question
bank, and a lesson's questions are reached through `questions.document_id`.

## 5. Invariants

### 5.1 `apply_visible_filter` is the only visibility rule

`app/flashcards/service.py` exposes one filter:

```
status = 'published'
AND (scope = 'official' OR (scope = 'personal' AND created_by = :user_id))
```

Every read path goes through it — the lesson list, the deck draw, the single-card lookup and the
summary counts — so they cannot disagree about what a learner can see. It plays the same role
`apply_published_filter` plays for questions.

Ownership failures are **404, not 403**, matching `_get_owned_session` in `app/quizzes/service.py`:
probing for someone else's card id must not confirm that it exists.

### 5.2 Provenance is written once, never inferred

**`scope` is set by the endpoint that created the card and never recomputed.**
`POST /v1/flashcards/import` is admin-gated and always writes `official`;
`POST /v1/documents/{id}/flashcards` is open to any learner and always writes `personal`. Neither
reads `scope` from the request body — a test asserts the create endpoint ignores a payload that asks
for `official`.

A role is an **authorization** check at write time ("may you call this endpoint?"), never a
**classification** input at read time. Deriving `scope` by joining `profiles.role` would get all
three of these wrong:

- An admin who taps "Add a card" while studying gets a **personal** card. The button they pressed
  decides, not who they are.
- **Revoking** someone's admin role does not reclassify the official cards they uploaded. The cohort
  still studies them; they were never "that admin's cards".
- **Promoting** a learner to admin does not turn their private cards official.

`created_by` answers _who made this_; `scope` answers _who it is for_. Different facts, different
columns.

### 5.3 A flashcard grade never writes `question_progress`

A self-rating is not an answer. Counting it would corrupt the question bank's
success / failing / pending / average-score stats. `submit_flashcard_review` writes
`flashcard_review_states` and nothing else, and there is a regression test asserting
`question_progress` stays empty.

### 5.4 Suspension is a per-user filter, not a reset

A learner can take any card they can see out of their own rotation and put it back at any time.
`flashcard_review_states.suspended` carries it, which gets three things right for free:

- **Per-user.** One learner retiring a shared official card leaves everybody else's deck untouched.
  The global lever for official content is `flashcards.status`, which is an admin's to pull.
- **Applies to shared cards.** `PUT /v1/flashcards/{id}/suspension` writes _the caller's review
  state_, not the card, so it is gated on visibility only — not on ownership, the way PATCH and
  DELETE are. You can exclude an official card without being able to edit it.
- **Non-destructive.** The schedule fields are left alone. A card parked at a 40-day interval comes
  back at 40 days: the learner asked to stop seeing it, not to forget what they had earned.

Excluded cards are absent from the deck draw **and from both hub counts** — an excluded card is not
pending work, so counting it would make the hub nag about cards the learner has explicitly dismissed.

The consequence worth stating: because a suspended card is invisible to the deck and to the counts,
the per-lesson card list in the Flashcards tab is the **only** surface that still shows it, and is
therefore the only route back into the rotation. It must keep listing suspended cards, and it must
offer the toggle on official cards too, or the feature becomes one-way.

Grading a suspended card is rejected with `409 card_suspended` rather than silently tolerated — the
backend enforces what the runner merely hides, the same posture as the quiz runner refusing answers
while a session is paused. It would also move a schedule the learner asked us to leave alone.

### 5.5 Deletion is asymmetric

A **personal** card is hard-deleted by its owner — it is the learner's own data and there is nothing
to preserve. An **official** card is **archived** by an admin (`status='archived'`), matching
`DELETE /v1/questions/{id}`, because other learners' review history points at it. Surprising enough
to be worth the docstring it carries.

Note this is a different axis from suspension (§5.4): archiving removes a card for _everyone_ and is
an admin action on the card; suspending removes it for _one learner_ and is that learner's action on
their own review state.

## 6. The draw

`draw_lesson_deck(db, user_id, document_id, scope, limit)`:

0. Suspended cards are dropped first, before the due/new split, so an excluded card cannot surface
   as either.
1. Cards with a state row and `due_at <= now()`, oldest deadline first.
2. Then cards with no state row (or `last_reviewed_at IS NULL`), shuffled.
3. Truncated to `limit` (default 20, max 100).

Cards already graded and not yet due are excluded — that is the point of the scheduler.

The partition happens in Python rather than as `ORDER BY random()` in SQL because due-ness needs the
`_to_utc_naive` normalisation to stay correct on SQLite (Postgres returns tz-aware datetimes,
SQLite naive ones), which means materialising the lesson's visible cards anyway. A lesson's cards
are bounded by what an admin imports for one lecture, and `list_due_cloze_cards` already reads a
lesson's cards the same way.

## 7. API

| method | path                                                       | auth          | notes                                             |
| ------ | ---------------------------------------------------------- | ------------- | ------------------------------------------------- |
| GET    | `/v1/documents/{document_id}/flashcards?scope=`            | learner       | Management list, `order_index` order              |
| GET    | `/v1/documents/{document_id}/flashcards/due?scope=&limit=` | learner       | The deck. Carries `back_text`, `due_at`, `is_new` |
| POST   | `/v1/documents/{document_id}/flashcards`                   | learner       | Always `scope='personal'`                         |
| PATCH  | `/v1/flashcards/{flashcard_id}`                            | owner         | Personal cards only                               |
| DELETE | `/v1/flashcards/{flashcard_id}`                            | owner / admin | §5.4                                              |
| POST   | `/v1/flashcards/{flashcard_id}/review`                     | learner       | `{rating: again\|hard\|good\|easy}`               |
| GET    | `/v1/me/flashcard-summary`                                 | learner       | The hub tree, `due_count` + `new_count` per node  |
| POST   | `/v1/flashcards/import?dry_run=`                           | **admin**     | §8                                                |

The first endpoint keeps the path the shell version already served; it is extended in place, not
replaced.

## 8. Import validation

Idempotent upsert keyed on `external_id`, so re-importing a payload updates rather than duplicating.
`created_by` is **not** reassigned on update — it records who first added the card.

`dry_run` runs the real insert/update path inside a `SAVEPOINT` and rolls it back, so a preview can
never drift from what a commit does. Same guarantee the question importer gives, and for the same
reason.

Rejects: unknown `document_id`, blank `front_text` or `back_text`, duplicate `external_id` within
one payload, and more than 500 cards per request.

## 9. UI

Three surfaces, all mirrored on mobile except the importer.

**Lesson reader, Flashcards tab.** `Card n of m`, then the front alone with "Tap to reveal". The tap
shows the back; four grade buttons follow, in this order and with these labels: **Again · Hard ·
Good · Easy** — the same as the Review bar, so the two features don't teach different gestures. All
four disable while the mutation is pending. An All / Official / Mine toggle drives `scope`, and your
own cards get inline add / edit / delete. Provenance is shown as a word ("Official" / "Mine"), never
colour alone (WCAG 1.4.1). The revealed card also offers "Exclude this card from reviews" — the
moment you have just seen the answer and decided you are done with it is the moment to ask, rather
than making the learner hunt for the card in the list.

Below the runner, **All cards in this lesson** lists every visible card with its provenance and
whether it is in the rotation, and carries the include/exclude toggle. Suspended rows are dimmed and
labelled "Not in rotation", and the heading counts them. Per §5.4 this list is the only place a
suspended card still appears, so it deliberately shows _all_ scopes rather than only the learner's
own cards.

The queue is derived by filtering graded ids out of the fetched deck rather than trusting the list to
shrink, so a background refetch cannot move the card out from under the reader — the same reasoning
as `ReviewTab`.

**`/learn/flashcards`.** A due/new drill-down over Book → Chapter → Sub-chapter → Lesson, one eager
fetch, each lesson deep-linking to `/learn/{id}?tab=flashcards`. Due and new are reported
**separately, never summed**: a card nobody has opened yet is not overdue, and conflating them would
make a freshly imported deck look like a backlog.

**`/learn/flashcards/manage`.** Web-only admin importer: file input, JSON textarea, dry-run preview,
and commit disabled until a dry run has been made against the exact current payload. Bulk JSON
authoring on a phone has no use, the same intentional parity break as the question importer.

## 10. Known follow-ups

- ~~**Three tree-walkers.**~~ **Done.** All three — `get_flashcard_summary`,
  `cloze.service.get_review_summary` and `progress/service.py`'s `get_bank_tree` — now share
  `app/common/hierarchy.py:load_content_tree`, which loads each level once and assembles the tree
  in Python. Each of them previously issued `1 + B + B·C + B·C·S` queries (306 for a
  five-by-ten-by-five course) to render a page both platforms open on mount; the cost is now four
  queries regardless of course size. `tests/conftest.py`'s `count_queries` fixture backs a guard on
  two of the three endpoints that asserts the query count is **equal across two tree sizes** — a
  magic number would churn on unrelated changes, whereas a reintroduced per-parent query is exactly
  what makes the second count diverge.

- **Review's per-lesson cost is unchanged and now dominates it.** `cloze._lesson_summary` calls
  `ensure_cloze_cards` and reads that lesson's cards per document, which is roughly three queries a
  lesson and cannot be batched while cloze generation stays lazy per document. Flashcards avoids
  this entirely because `_deck_counts` is one grouped query, which is why the Flashcards hub got
  the full win and Review only got the structural half. Batching Review's counts means reworking
  lazy generation — a separate change with a real behavioural seam in it, not a refactor.
- **`created_by` CASCADE.** All seven content tables (`questions`, `books`, `chapters`,
  `sub_chapters`, `documents`, and now `flashcards`) cascade `created_by` to `profiles`, so deleting
  one admin profile would take the content library with it. Tracked as its own `HARDEN` ticket
  because it is a product decision across all seven, not a patch on the newest one. Note CASCADE is
  not even wrong for a _personal_ card — your own study card reasonably goes with your account — so
  the `scope` distinction is probably part of whatever the answer is.

## 11. Deliberately out of scope

Any link between flashcards and the `questions` pool; `difficulty`-aware scheduling (the column
exists on questions but is unused repo-wide); Anki-style sub-day learning steps; cloze and flashcards
sharing one queue; sharing personal cards between learners; AI-generated cards; a mobile admin
importer.
