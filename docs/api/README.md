# API Documentation

FastAPI auto-generates interactive API docs from the running service:

- Swagger UI: `/docs`
- OpenAPI schema: `/openapi.json`

Curated, hand-written API documentation (auth flows, error conventions,
pagination, etc.) starts alongside the identity/account foundation in Phase 1.

## Question import samples

All three are payloads for `POST /v1/questions/import`, uploadable as-is from
the admin screen at `/question-bank/manage`:

- `questions-import-sample.json` — the reference payload. Covers both scoring
  schemes, overlapping tags, and a `draft` question (drafts are never drawn
  into a quiz and never appear in the question bank).
- `questions-import-lesson-example.json` — the same idea scoped to one lesson
  via `document_id`, which is what the lesson reader's Quizzes tab filters on.
- `questions-import-coverage-set.json` — 12 questions spread over four lessons,
  built to exercise every filtering and scoring path at once: topic OR, tag AND
  (`treatment` alone matches 7, `treatment` + `rezidentiat-2022` narrows to 4,
  `diagnosis` + `treatment` to 0), the `document_id: null` unassigned bucket,
  one `draft` that must stay invisible, and `multi_5_per_option` keys with two
  of five correct so the partial band is reachable.

**The `document_id`s in the last two are local dev lesson ids**, so replace them
with ids from your own database — the id in `/learn/<id>` — or the import is
rejected.
