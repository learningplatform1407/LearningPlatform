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

## Where admin authoring lives

Admin content tools stay **contextual-inline**, next to the content they
create: books and chapters on `/learn/library`, lecture upload inside the book
you are viewing. That way the parent is always already chosen and cannot be
mis-picked, and there is exactly one copy of each form — which also keeps
mobile at parity, since it has the same inline affordances.

The two exceptions are the bulk JSON importers (`/question-bank/manage`,
`/learn/flashcards/manage`), because a dry-run-then-commit workflow does not
fit inline, and they are web-only by design.

`/admin` is a **directory, not a console**: it links to those tools and
re-implements none of them. It exists for discoverability — each tool used to
hide in a corner of a different learner page. Please don't move the forms into
it; that would recreate the picker cascade the inline placement avoids, and
either break mobile authoring parity or have to be built twice.
