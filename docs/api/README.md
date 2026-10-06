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

## Flashcard import samples

Payloads for `POST /v1/flashcards/import`, uploadable as-is from the admin
screen at `/learn/flashcards/manage`. Every imported card is `official` and
visible to everyone studying its lesson; `external_id` is the upsert key, so
re-importing the same payload updates those cards instead of duplicating them.

- `flashcards-import-sample.json` — six cards for one lesson. Definition and
  mnemonic style rather than multiple choice, which is the point of the
  feature: flashcards cover what the exam pool doesn't. The last entry is
  `draft`, so it must stay out of every deck, list and count until a
  re-import flips it to `published`.
- `flashcards-import-rejections.json` — deliberately invalid, for checking the
  error display. Exercises both server-side rejections at once: a duplicate
  `external_id` within the payload (index 1) and an unknown `document_id`
  (index 2). Validation is per batch, so the one valid card is skipped too.

**Replace the `document_id`s before importing**, same as above. Blank
`front_text`/`back_text` and a payload over 500 cards are also rejected, but
the first is caught client-side by `flashcardImportRequestSchema` and surfaces
as a format error rather than reaching the server.
