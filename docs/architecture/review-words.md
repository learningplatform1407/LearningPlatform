# Review words

Which words the Review tab hides is **authored by an admin, from inside the
lesson**. It used to be guessed from the text. This records why that changed,
what the endpoints look like, and what the change costs.

## What it replaced

`app/cloze/generation.py` picked the gaps with a heuristic: for each
paragraph, the first two tokens that were at least five letters long and not
in a list of ~90 English stopwords, or a run of two or more digits. Two per
paragraph, in source order, deterministic.

It had two problems, and only the second was fixable by tuning it.

1. **It picked the wrong words.** "First two long non-stopwords" selects for
   length, not for what a paragraph teaches. On a paragraph about a fracture
   classification it would blank the two longest words in the opening clause
   and leave every eponym, percentage and complication — the things a
   residency exam actually asks about — in plain sight.
2. **It could not be told otherwise.** There was no way to add a word it
   missed or remove one it shouldn't have taken, so a bad gap stayed bad for
   every learner, forever. The stopword list being English-only against a
   Romanian corpus made that worse rather than being the root cause.

So the heuristic is gone, along with its module and its unit tests. A lesson
now has exactly the review words an admin marked, and until an admin marks
one, Review has nothing to ask. That is the intended state for a new lesson,
not a gap to fill: an empty Review is honest, a Review full of the longest
words in each paragraph was not.

## The authoring surface

The tool lives in the lesson's own left tool notch, next to the marker and the
note tool, and only renders for `me.role === "admin"` (web only — see
"Platforms" below). It works in **Text mode only**, because a cloze card is a
pair of offsets into an extracted paragraph and only the text view renders
those; in PDF mode the button is dimmed and says so, exactly like the pen in
the other direction.

With the tool in hand:

- **Drag over a word** (or a phrase) to mark it. The lesson's existing
  letter-level drag is reused unchanged — the same gesture, and the same
  `BlockRange[]`, as highlighting.
- **Drag over a word already marked** to unmark it. One tool, both
  directions: the same "press it again to turn it off" rule the markers follow
  (design.md §5), rather than a second eraser-like tool.
- The words already marked are **underlined in the cloze colour** while the
  tool is held, and not otherwise — see "Not an answer key" below.

`D` picks the tool up and puts it down, and does nothing at all for a
non-admin rather than explaining a tool they have never been offered.

## The endpoints

```
POST   /v1/documents/{document_id}/cloze-cards        → 201 ClozeCardResponse
DELETE /v1/documents/{document_id}/cloze-cards/{id}   → 204
```

Both `require_admin`. The existing `GET` (all cards) and `GET /due` are
unchanged and open to any signed-in learner. No migration: `cloze_cards` keeps
the columns it had.

**The request carries offsets, never the answer text.**

```json
{ "block_index": 4, "start_offset": 112, "end_offset": 120 }
```

`answer_text` is sliced out of the lesson server-side
(`app/cloze/service.py::create_cloze_card`). A client cannot therefore create
a card that disagrees with the paragraph it points into — which is also what
keeps the Review gap safe, since the gap is rendered from the lesson text at
those offsets rather than from the stored answer. Responses still carry no
`answer_text`, as before.

Refusals, all with a code the clients translate:

| Case                                                      | Status, code           |
| --------------------------------------------------------- | ---------------------- |
| No such block, or a heading/image rather than a paragraph | 422 `invalid_block`    |
| `end_offset` past the end of the paragraph                | 422 `invalid_offsets`  |
| The selection is blank or whitespace                      | 422 `invalid_offsets`  |
| It overlaps a word already marked                         | 409 `overlapping_card` |

The overlap rule is not fussiness: `spliceClozeSpans` on both clients assumes
spans do not intersect, so two gaps over the same letters would render nested.
Refusing is better than silently merging, and the client turns the 409 into
"That passage already holds a review word" — which is what a second admin
marking the same lesson sees.

Adjacent is not overlapping: `[0, 4)` and `[4, 16)` are both allowed, so
"The " and "mitochondria" can be separate gaps.

## Not an answer key

`GET /cloze-cards` returns every gap in the lesson, which is the answer key to
the Review tab by position. It never returned `answer_text` and still doesn't.
Two further rules keep it out of a learner's reader:

- The lesson page fetches it **only while an admin holds the review-word
  tool** (`enabled: isAdmin && tool?.kind === "cloze"`). A learner's reader
  never issues the request at all.
- The underlines render only from that same fetch, so there is no state in
  which a learner sees every gap marked in the text they are about to be
  tested on.

The endpoint itself is still learner-readable, as it was before: it is how a
client could build its own "what is in this lesson" view, and it reveals
positions, not answers.

## What deleting a word takes with it

`ClozeReviewState.cloze_card_id` is `ondelete="CASCADE"`, so unmarking a word
deletes every learner's spaced-repetition progress against it. That is the
right outcome rather than a regret: the word is no longer part of the lesson,
so there is nothing left for that progress to be about. It does mean unmarking
is not an undo — re-marking the same passage creates a new card that everyone
meets fresh.

## Existing cards

Cards already in the database from the heuristic era were **left alone**.
Nothing migrates and nothing is deleted: dropping generation stops new ones
appearing, and admins curate what is there with the new tool like any other
word. The alternative (a migration deleting every `cloze_card`) would have
taken real review history with it through the cascade above.

## Offsets and a lecture-text replace

A cloze card is offsets into a paragraph, so editing that paragraph can move
the text out from under it. `POST /{document_id}/replace` deliberately leaves
cloze cards, flashcards and questions alone — the same decision, and the same
exposure, that annotations and `source_quotes` already carry (see
[`lecture-pdf-ink.md`](./lecture-pdf-ink.md)). A replace that reflows a
paragraph can therefore leave a gap over the wrong words, or over whitespace.
Nothing silently breaks: the gap renders from whatever is now at those
offsets, and an admin can unmark and re-mark it. Re-anchoring marks across a
text replace is one problem shared by four features and belongs in its own
change, not this one.

## Platforms

Web only, and this is the **fifth exception** to the contextual-inline admin
rule in [`README.md`](./README.md) — though a mild one, because the tool _is_
contextual-inline, just not on both platforms. Marking review words is
authoring, like a lecture upload or a chapter tree, and belongs where the
library authoring went: on a keyboard and a large screen, reading a paragraph
and deciding what matters in it. Learners get Review in full on both
platforms, as always.

## Follow-ups

- **Category hints.** design.md §11 wants `[ procent ]` / `[ eponim ]` over
  the current first-letter hint, which was out of reach while cards were
  generated (TASKS_SPLIT DESIGN-2 says as much). Now that a human marks each
  word, a `hint` column on `cloze_cards` and a field in this POST is all it
  needs.
- **A lesson-wide list.** The tool marks and unmarks in place, which suits
  reading a lesson top to bottom. Reviewing every word in a lesson at once —
  to spot a paragraph with none — would want a panel, not a drag.
