# Question of the day

One published question is designated per calendar day. Learners answer it from
a calendar on the Learn page; past days stay browsable, showing the score and
the reasoning if they answered that day, and the question alone if they did
not. Admins can override which question a day gets.

This is the first piece of the gamification concept **ROADMAP-1** defers.
Streaks, points and leaderboards are explicitly not here.

## 1. The seven decisions

These were settled before implementation, and the rest of this document is
mostly their consequences.

1. **One fixed institution timezone** (`INSTITUTION_TIMEZONE`, default
   `Europe/Bucharest`), not per-user. Everyone sees the same question, rolling
   at the same local midnight, so "today's question" means the same thing to
   everybody and two learners' calendars are comparable.
2. **Mobile gets a card on the Learn hub** opening the same overlay, rather
   than a rail it has no room for.
3. **Answering does not touch `question_progress`.**
4. **Auto-open once a day while unanswered**, with the dismissal remembered
   client-side.
5. **Admin override covers today and future only**, and today only while
   nobody has answered.
6. **The override lives on a page under `/admin`**, not inline in the overlay.
7. **Web closes with an X; mobile keeps its "Close"** text.

## 2. The institution day

`app/core/clock.py` holds the only two functions that know about timezones:

```python
institution_zone() -> ZoneInfo            # cached; the only reader of the setting
institution_today(now: datetime) -> date  # pure: instant -> local date
```

`institution_today` **takes `now` and never calls a clock**, which is the
`compute_next_state(..., now=now)` pattern quizzes already uses: it makes the
one timezone-sensitive line in the system testable with a literal. It converts
instant → `.astimezone(zone).date()` and never the other way. Constructing a
local midnight and adding an offset would be wrong twice a year — on the
spring-forward day local 03:00–04:00 does not exist.

It also **rejects a naive datetime** rather than accepting one, because
`astimezone` on a naive value silently assumes the _host_ zone. That is the
kind of bug that is invisible on a developer's laptop and wrong in production.

`institution_timezone` is the first setting in `app/core/config.py` with a real
default rather than `None`. That is deliberate and commented there: "no
timezone" has no sensible meaning for a value a calendar day is keyed on.

**`tzdata` is a dependency.** `ZoneInfo("Europe/Bucharest")` raises
`ZoneInfoNotFoundError` on slim and Alpine images, at _request_ time rather
than import, so without the wheel it would surface as a 500 on the Learn page
in production and nowhere else.

`app/daily/dependencies.py` threads the result as a **frozen dependency**, so
`now` and `today` can never disagree across a midnight straddle inside one
request:

```python
@dataclass(frozen=True)
class Clock:
    now: datetime
    today: date
```

Tests override `get_clock` exactly as `conftest.py` already overrides `get_db`
and `get_current_user`. There is no `freezegun` or `time-machine`: with `today`
threaded, exactly one function depends on the wall clock and it is pure.
`tests/test_clock.py` covers both DST transitions against the real tz database
— the 23-hour spring-forward day and the 25-hour autumn day.

## 3. How a day comes to exist

**The first person to open Learn on a given day triggers the draw.** It is
written to one row keyed on the date, and everyone after reads that row — so
the day syncs universally off whoever shows up first. If two people land in the
same instant, both attempt the insert, the unique index lets one win, and the
loser folds into the winner's row; nobody ever sees a different question.

`_insert_day` uses the house race idiom from `app/progress/service.py`:
`begin_nested()` savepoint → `add` → `flush`, and on `IntegrityError` roll the
savepoint back, re-`get`, and re-`raise` if the row is _still_ absent so a
different violation is not misread as a race. There is no `with_for_update()`:
that locks an existing row, and the whole premise is that there isn't one.

**A scheduler is future work and this deliberately does not need one.** That is
the stance `quizzes.md` already records for lazy session expiry — correctness
never depends on a job having run. Cron would only buy niceties: pre-drawing at
midnight so the first visitor does not pay for it, and pre-filling days nobody
visited. `app/quizzes/sweep.py` is already an unwired CLI entrypoint waiting on
the same infrastructure, so when scheduling arrives, two things plug into it.

**No day is ever backfilled.** A past date with no row stays empty. Inventing a
question now for a day that never had one would be a lie, and would let someone
farm history. Both clients render such a day as inert rather than as a tap that
404s.

**The draw** reuses the one visibility predicate rather than writing a second:
`apply_published_filter(select(Question), document_ids=None, tag_ids=[])`, then
`func.random()`, then a `NOT EXISTS` excluding questions used on an earlier day
— and **falls back to allowing repeats once the pool is exhausted**, because a
bank of thirty must not stop producing a daily question on day thirty-one.

**An empty bank writes nothing** and returns `200` with `question: null`, not
the `400 no_questions_match` that `start_session` raises. That error answers a
filter _the caller supplied_; here the caller supplied nothing, so a 4xx would
misattribute the problem and a red "Failed to load" would greet every fresh
environment and CI run. `409 no_questions_available` is reserved for the admin
`PUT`, where someone did ask for something impossible.

## 4. The tables

**`daily_questions`** — `for_date` (`Date`) as the primary key, `question_id`
FK **RESTRICT**, `selected_by` FK **SET NULL** nullable, timestamps. `for_date`
is the first `sa.Date` column in the schema; everything else is
`DateTime(timezone=True)`, because everything else reasons about instants.

`question_id` is RESTRICT, not CASCADE: questions are archived rather than
deleted, but if one ever were, cascading would erase a day people had already
answered and their scores with it.

There is also a `UniqueConstraint("for_date", "question_id")`, redundant
against the primary key and present only so the child table's composite foreign
key has a unique index to point at.

**`daily_question_attempts`** — primary key `(user_id, for_date)`, which is
`QuestionProgress`'s shape, so "did I answer today" is a single
`db.get(DailyQuestionAttempt, (user_id, today))`. Plus `question_id`,
`selected_option_ids`, `points_awarded`, `points_possible`, `outcome`,
`answered_at`.

```python
ForeignKeyConstraint(
    ["for_date", "question_id"],
    ["daily_questions.for_date", "daily_questions.question_id"],
    ondelete="RESTRICT", onupdate="RESTRICT",
)
```

**That composite FK earns its cleverness.** It makes the database enforce both
"an attempt cannot exist for a date with no draw" and "the day's question
cannot change while attempts exist" — so decision 5's core rule is a
constraint, not only an `if`. The application check stays too, so an admin gets
a clean 409 instead of an `IntegrityError`.

Every constraint is declared on the models as well as in the migration:
`conftest.py` builds from `Base.metadata`, so a constraint living only in a
migration is drift the suite can never catch.

### Why not write through to `question_progress`

`question_progress` is one row per `(user, question)` with latest-attempt-wins,
so recording a daily answer there would silently overwrite a better earlier
result from a real quiz. It also has no date dimension, so it could not express
"you answered on the 12th" anyway. The daily feature therefore keeps its own
attempts table and grades with `grade_answer` directly, never
`grade_and_record`. A test asserts `question_progress` is still empty after a
daily answer, because this is the kind of rule that gets "helpfully" undone.

## 5. The response shape, which is the whole privacy story

```
DailyQuestionResponse
  for_date: date
  server_today: date          # the client never computes "today"
  answerable: bool            # today, unattempted, question published
  question: <QuestionBankItem-shaped> | None   # None only when the bank is empty
  attempt: <QuestionRevealResponse> | None     # the ONLY field carrying the key
```

`attempt` is non-null **iff** this user answered that day. "Score and reasoning
if they solved it, otherwise just the question" is therefore one nullable field
rather than a branch a client could get wrong — and both clients branch on
`attempt` and `answerable`, never on a date comparison of their own.

This leans on architecture that already existed: `build_reveal` is the only
thing in the codebase that ever serialises
`correct_option_ids`/`rationales`/`explanation`, and `QuestionBankItem` omits
them by construction. `_day_response` in the router is the single place the key
is or is not attached. A canary test serves a question whose rationale holds a
sentinel string for a past day the user did **not** answer, and asserts the
sentinel is absent from the serialised response.

`answerable` is computed server-side for the same reason flashcards' `can_edit`
is. **`selected_by` is not in the student response at all**: which admin picked
the question is not a student's business — unlike a feed post, where the byline
is the point. The admin response gets a derived `overridden: bool` instead.

**Every response carries `server_today`,** and the clients are built so the
device clock is never consulted for anything that matters. The precedent is
exact: `QuizSession` carries `server_time`, and `quizzes.md` states the rule.

## 6. API

| method | path                                  | notes                                        |
| ------ | ------------------------------------- | -------------------------------------------- |
| GET    | `/v1/daily-question`                  | today; **materialises on demand**            |
| GET    | `/v1/daily-question/calendar`         | `?start=&end=`; declared before `{for_date}` |
| GET    | `/v1/daily-question/{for_date}`       | one day; never materialises                  |
| POST   | `/v1/daily-question/answer`           | **no date in the path** — see below          |
| GET    | `/v1/admin/daily-question`            | today + 14 days, with answer counts          |
| PUT    | `/v1/admin/daily-question/{for_date}` | `{question_id: string \| null}`              |

`/calendar` is declared **before** `/{for_date}` because that parameter is
typed `date`, so a static route after it would 422 on "calendar" rather than
fall through — the ordering trap the feed hit with `/image-upload-url`.

**Only `GET /v1/daily-question` draws the day.** `GET /{for_date}` reads an
existing row by design, so routing today through it would 404 until some other
visitor happened to trigger the draw. Both clients therefore read today through
the no-date endpoint and use `{for_date}` only for past days; a test on each
platform asserts `getDailyQuestionForDate` is never called for today.

A future date **404s rather than 403s**: an admin-pre-booked row does exist in
the table, and confirming it would leak tomorrow's question.

**The answer path carries no date, deliberately.** A path parameter that must
always equal the server's own `today` is an invitation to lose answers at
midnight: a client that rendered at 23:59:58 and submits at 00:00:01 would send
yesterday and be rejected for an answer given in good time. Instead the body is
`{question_id, selected_option_ids}`, with `question_id` acting as a
**concurrency token** — if it does not match today's draw, the server returns
**409 `day_rolled_over`** and the client refetches. This also makes "answer a
past day" structurally inexpressible, which is a stronger form of decision 5
than any check. A second answer returns the **existing** reveal with 200 rather
than 409: a double-tap is not an error the user can act on.

Handlers call `get_or_create_profile` before the attempt insert, because a
learner can reach the answer endpoint without ever having called `GET /v1/me`
and `user_id` references `profiles.id`.

## 7. A day whose question was later archived

`archive_question` only flips `status`, and the RESTRICT FK keeps the row.
Three rulings:

- **Read paths fetch by primary key and deliberately do _not_ re-apply
  `apply_published_filter`.** This diverges from `answer_bank_question`, whose
  published-filter fetch is a documented safety measure, so it needs saying
  why: for a daily question the key is revealed only for a date the caller
  already holds an attempt on — **the attempt is the authorisation, not the
  question's status** — and an unanswered day returns no key at all.
  Re-applying the filter would blank a past day and make a recorded score
  unreadable, orphaning exactly the history the RESTRICT FK exists to protect.
- **Today's answer path still refuses an archived question** (409
  `question_unavailable`), because answering would create new history on a
  retired question. An admin can then override today — nobody has answered, so
  it is permitted — and the day recovers.
- **Not done:** making `archive_question` refuse when the question is a
  current or future daily. That reaches across domains for a case the recovery
  path already handles.

Accepted and worth stating: an admin **editing** a question a past day points
at retroactively changes what the reveal _says_, since `build_reveal` rebuilds
`in_key` from the live key. The stored
`points_awarded`/`points_possible`/`outcome` stay honest, which is precisely
why all three are stored rather than recomputed. `question_progress` has the
same exposure today.

## 8. Clients

Shared day arithmetic lives in `packages/ui/src/calendar/`, the only package
both apps import at runtime. **Strings in, strings out, never a `Date` across
the boundary**: `new Date("2026-10-12")` parses as UTC midnight while
`new Date(2026, 9, 12)` is local midnight, and mixing them is the classic
off-by-one that renders the 1st in the previous month's last cell. Everything
internally uses `Date.UTC`, which makes the grid byte-identical in every
timezone.

Its two formatters pin `timeZone: "UTC"`, unlike the ones in
`packages/ui/src/format/date.ts`, and the difference is the point: those render
an _instant_, which belongs in the viewer's local time, while a calendar date
has no instant and no zone. `index.test.ts` records what the package's `TZ=UTC`
pin does and does not prove, and the UTC pin on `formatCalendarDate` was
verified by removing it and watching the suite go red under
`America/Los_Angeles`.

**Web** puts a calendar rail beside the Learn hub, hidden below `lg` where the
question becomes a sixth nav card. **Mobile** has no room for a rail, so the
calendar sits at the top of the full-screen sheet — without that, mobile could
reach today's question but never a past one.

On both platforms the layout wrapper is **hoisted above the lessons query's
early returns**. Each branch used to return its own container, so anything
added to the success branch alone would vanish during loading and errors, and
would not mount until an unrelated query resolved — delaying the auto-open
behind it.

### The dismissal rule

The question "is this the first time today?" is never asked directly. One
marker holds the **server's** date, and the widget offers itself while that
differs from `server_today`. The marker invalidates itself the moment the
institution day rolls over, so there is nothing to expire and no device clock
involved; "answered on another device" is handled for free, because `attempt`
comes from the server.

Auto-open is a **derivation**, not state written from an effect, latched the
moment the reader takes control — by opening a day, by closing one, or by
**answering**. That last one is not an optimisation: answering invalidates the
query, `attempt` comes back non-null, and without the latch the overlay would
close on the learner before they could read the score they just earned. A test
on each platform pins it.

Closing writes the marker **whichever day is on screen**, because the marker
means "today's question has been offered" rather than "this exact day was
closed". Mobile needs that reading, since its calendar sits inside the sheet
and browsing to a past day before closing is reachable there.

With one carve-out: closing writes nothing when today has **no** question. The
card is still openable on an empty-bank day — it is what reports the emptiness
— and marking today from there would suppress the auto-open if an admin
published a question later the same day. With that exception in place, every
path where auto-open was wanted does resolve before any calendar tap is
possible, so closing cannot suppress an offer that had not happened.

Storage is a convenience and never correctness: every read and write is
`try/catch`-wrapped, since Safari in private mode throws on `setItem` and a
cleared profile reads back empty. The worst outcome is the widget offering
itself once more — which is also why closing latches on an _explicit_ flag
rather than on the write having succeeded.

Web reads the marker through `useSyncExternalStore`, whose server snapshot is
"nothing dismissed"; mobile reads it through react-query because AsyncStorage
is async, which needs an extra guard against offering the sheet while the
marker is still unread — the API query can win that race, and an unread marker
compares unequal to every date.

### The modal

`apps/web/src/components/modal.tsx` is the first overlay in the web app:
nothing there previously rendered a dialog. It holds `onClose` in a ref so its
effect depends on `open` alone — the daily overlay's handler closes over which
day is open, so its identity changes between renders, and a dependency on it
would run the cleanup every time, pushing focus back to the opener.

**It has no focus trap, and that is a documented limitation.**
`aria-modal="true"` already tells assistive technology to ignore the rest of
the page, so the screen-reader case is covered; what remains is that a sighted
keyboard user can Tab past the last control into the page behind. A real trap
needs tabbable-node queries, Tab/Shift-Tab interception and mutation handling,
with no dependency in the repo to supply it. Worth revisiting when a third
overlay lands.

Mobile's `Overlay` was extracted from `learn/[id].tsx`, which had two
full-screen sheets built from private styles. Its 55 tests pass untouched,
which is what makes the extraction believable.

## 9. Out of scope

Streaks, points and leaderboards (ROADMAP-1's own conversation); per-user
timezones; notifications or reminders; multiple questions per day; answering a
day you missed; editing an answer; a focus trap in the web modal; converting
mobile's other overlays; the deferred `@lp/contracts` pass for question shapes
(QUIZ-9); and a scheduler — the lazy path makes one unnecessary, and there is
none to hang it on.
