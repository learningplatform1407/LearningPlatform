# Feed: admin-authored announcements

Admins post announcements — a title, a body, an optional picture — and everyone
else reads a dated list. `/feed` was already a top-level nav item on both
platforms pointing at a "Coming soon." stub; this fills it in.

This supersedes parts of the FEED epic in `TASKS_SPLIT.md`, which was written
before anyone had decided who authors a post. See **What changed from the
epic** at the end.

## The shape of a post

`feed_posts`: `title`, `body`, `category`, `image_path`, `author_id`,
`published_at`, plus the usual `created_at`/`updated_at`.

**`title` is required.** An announcement list wants scannable headlines rather
than a wall of first paragraphs. Optional would mean two rendering paths per
card and a composer where it is never clear whether to fill it in.

**There is no `link_url`.** A URL belongs in the body text the author is
already writing; a separate field means two places a link can live and an
ambiguity on every post. Both clients instead linkify `https?://` runs in the
body — **that scheme only**, which is where the risk actually sits: the body is
free text, and a looser matcher is how `javascript:` reaches an `href` or
`openBrowserAsync`. Mobile opens matches through `expo-web-browser` rather than
`Linking.openURL`, so an unexpected target cannot hand off to another app.

That rule lives in **one place**: `splitLinkifiedBody` in
`packages/ui/src/feed/`, which returns `{text, href?}` segments so each
platform renders them its own way (an `<a>` on web, a pressable `Text` handing
the href to `expo-web-browser` on mobile) while the decision about what counts
as a link is made once. It started out copy-pasted into both screens, which
made this paragraph a promise with two implementations — fine until someone
tightens one of them. `packages/ui/src/feed/index.test.ts` covers
`javascript:`, `data:`, `mailto:`, `file:` and `intent://`, and all five fail
if the pattern widens.

Each platform still has its own test that a URL in a body is actually
tappable. The first mobile version of that pressed the body text and proved
nothing — a plain RN `Text` has no `onPress`, so the press never reached
anything; it asserts on the link role now.

**There is no draft or archived status.** A post is published when created, so
`published_at` comes from its `server_default` and deleting is a hard delete.
Compare flashcards, which stage and retire official decks through a status
column: nothing holds review state against an announcement, so a post pulled
for being wrong should simply stop existing — including its image, which lives
in a public bucket and would otherwise keep being served.

`published_at` is nonetheless kept separate from `created_at`, as the
_editorial_ date the list displays and sorts on. `list_posts` filters
`published_at <= now()`, which is a no-op today but makes FEED-3's "published
only" true of the endpoint and means scheduling later is a UI change rather
than a migration.

## Two deliberate divergences from flashcards

Both are called out here because both look like bugs if you only read one side.

### 1. `can_edit` / `can_delete` are role-based, not ownership-based

Flashcards gate on `created_by == user_id`. Feed does not: **any admin may edit
or delete any post**, including one written by an admin who has since left. A
flashcard is a learner's own study material, so ownership is the right axis
there. An announcement is institutional speech — a wrong or stale one has to be
fixable by whoever is on duty, not only by whoever typed it.

They are still **computed server-side**, in `_to_response`, which is the seam
commit `ad08d02` established after both clients inferred a flashcard permission
from `is_mine` and got it wrong. The arithmetic here is trivial
(`can_edit == is_admin`) and a client could do it — that is not the point. The
point is that the policy lives in one function, so narrowing it later to the
author alone, or to a moderator role, is a server-side edit with no client
change, and the UI stays `{post.can_edit && <Edit/>}` on both features. Both
platforms have a test asserting that an _admin_ who receives `can_edit: false`
gets no button, which is what pins the client to the flag rather than the role.

### 2. `author_id` is `SET NULL`, not `CASCADE`

The seven other authored tables (`questions`, `books`, `chapters`,
`sub_chapters`, `documents`, `flashcards`, and `quizzes` before it was dropped)
all `CASCADE` from `profiles.id`, which means deleting one admin profile takes
their content with it. That is a known problem tracked as HARDEN-8.

`feed_posts` does not join them. An announcement is institutional and must
outlive the account that wrote it; a departing admin should not erase the
notice history. There was no migration cost in choosing this on a new table,
and `notebook.source_document_id` is the existing precedent for the shape.
Being consistent with a pattern already identified as wrong is not worth much.

Two consequences worth knowing:

- Every read path **must outer-join** `profiles`. An inner join would silently
  hide exactly the posts this column exists to preserve.
  `test_post_outlives_its_author` is the test that catches it, and it does fail
  if you swap `outerjoin` for `join`.
- `author` is nullable all the way out to both clients, which fall back to a
  generic "Staff" byline rather than hiding the post.

## The `feed-images` bucket

A third bucket shape. Both halves already existed separately in this schema, so
only the pairing is new:

|                 | `avatars`           | `documents`                                | `feed-images`     |
| --------------- | ------------------- | ------------------------------------------ | ----------------- |
| `public`        | true                | false                                      | **true**          |
| read            | public policy       | `authenticated` select                     | public policy     |
| client write    | per-user-folder RLS | none                                       | **none**          |
| write gate      | RLS                 | `require_admin` on the signed-URL endpoint | `require_admin`   |
| size/type limit | none                | checksum verify after upload               | **on the bucket** |

**`public = true`, like `avatars`,** because the read URL then never expires.
This is the deciding factor. The private path uses
`createSignedUrl(path, 3600)` and **neither client refreshes an expiring signed
URL** — see `ExtractedImage` on both platforms — so images silently 403 after an
hour. A feed is the one long-lived, left-open screen in the app, which is
exactly where that latent bug would surface. There is also nothing to protect:
announcements are for the whole user base.

**No write policy at all, like `documents`,** so `require_admin` on
`POST /v1/feed/image-upload-url` is the real gate. Copying `avatars`'
per-user-folder write policy instead would let _any_ authenticated learner
write into `feed-images/{their_uid}/`. They could not create a post, but that
is unpoliced storage against a shared quota from any signed-up account. RLS has
no admin concept anywhere in this repo to express the actual rule with.

**`file_size_limit` and `allowed_mime_types` are set on the bucket,** which
neither existing bucket does. The API's `size_bytes`/`mime_type` checks are
client-declared and therefore advisory — they buy a clearer, earlier 422 — and
unlike `documents` there is no re-download-and-checksum step afterwards to
catch a bad upload. There deliberately isn't one: no processing pipeline, no
integrity requirement for a decorative image. So the bucket is the only limit a
client holding a signed upload URL cannot route around.

### Upload flow

1. `POST /v1/feed/image-upload-url` (admin) → `{ storage_path, token }`
2. `uploadToSignedUrl(storage_path, token, file)` straight to Storage
3. `POST /v1/feed { title, body, category, image_path }`

The **server picks the extension** from the declared mime type rather than
trusting a filename, and the uuid is fresh per upload rather than keyed on a
post — so replacing a picture writes a new object instead of upserting over the
live one, and nothing serves a stale image from cache.

`image_path` is then **validated on the way back in** against
`^feed/<uuid4>\.(jpg|png|webp)$`. It arrives in the request body, so without
that check an admin token could point a post at an arbitrary object in a public
bucket.

### Why `image_path` and not `image_url`

`profiles.avatar_url` stores a full URL because the _client_ builds it there.
Here the backend owns the write, so it keeps the key:

- `settings.supabase_url` defaults to `None`, so building the URL server-side
  would make every feed GET test monkeypatch settings.
- Rows stay portable, with no project ref baked in.
- The delete path has the key it needs.
- The value can be checked against a pattern we minted. `avatar_url` has that
  hole today; this is the screen every user reads, so don't copy it here.

`getPublicUrl` is a synchronous string concat, so the clients pay nothing for
resolving it themselves.

### Orphaned images

Four sources, three closed:

- **Replacing or clearing a picture**, and **deleting a post** — the service
  deletes the old object, always _after_ the commit succeeds. The other order
  risks deleting the object and then failing the commit, leaving a live post
  pointing at a missing image. A failure there is logged and swallowed for the
  same reason: the user's edit did succeed, and an unreferenced object is
  invisible. The `except` is deliberately broad; an earlier narrow
  `except (StorageError, RuntimeError)` missed httpx's transport errors and so
  turned an unreachable Storage into a 500 on an already-committed delete.
  `_discard_image` also **declines to delete a key another post still
  references** — two posts can hold the same one, because `image_path` comes
  from the request body and an admin can copy it off `GET /v1/feed`.
- **An abandoned composer** — closed by uploading on submit rather than on
  pick, so walking away uploads nothing at all.
- **A retry after the `POST` failed** — the clients remember the key an upload
  already produced and reuse it, so a 422 or a dropped connection costs one
  object rather than one per attempt. Cleared when the pick changes.

What is left is a crash between the Storage upload and the `POST` landing,
which has no sweeper. It is admin-only and rare; FEED-9 has the reaper (list
the bucket, anti-join `feed_posts.image_path`).

## Pagination

`GET /v1/feed` takes `limit`/`offset` per the house convention, but **both
clients fetch one page and there is no "Load more" yet**. That is zero offset
skew by construction: a post arriving between page 1 and page 2 cannot
duplicate or skip a row if there is only ever one page.

The cost is that anything past that page is **unreachable**, not merely
unfetched — a list that simply ends reads as the whole history. So the clients
ask for `FEED_PAGE_SIZE` (matching the server's `MAX_FEED_LIMIT`, rather than
accepting the smaller `DEFAULT_FEED_LIMIT`), and when a response comes back
full they say "Showing the N most recent announcements" instead of implying
there is no more. Paging proper is still FEED-9; this makes the gap visible
rather than silent in the meantime.

Two things are in place now because they cannot be retrofitted cheaply:

- `ORDER BY published_at DESC, id DESC`. The `id` tiebreak makes the order
  **total**. Without it two posts sharing a timestamp are free to swap places
  between queries, which under paging is a genuinely skipped row rather than a
  cosmetic wobble. `test_posts_sharing_a_timestamp_are_ordered_by_id` uses
  fixed ids so that id-descending is the reverse of insertion order; it fails
  if the tiebreak is removed.
- `ix_feed_posts_published_at`.

When "Load more" lands it needs `useInfiniteQuery` with **dedupe-by-id when
flattening pages** and a full reset after the composer creates a post. Keyset
(`?before=<published_at>`) is the better long-term answer, and the index is
already ordered for it, but it diverges from the repo's offset convention so it
should be a deliberate change rather than a rider.

## What changed from the FEED epic

| FEED-1 as written                                      | What shipped                             |
| ------------------------------------------------------ | ---------------------------------------- |
| `title`                                                | kept, required                           |
| `category` = news / exam / livestream                  | narrowed to `news` / `media`             |
| `link_url`                                             | dropped — URLs live in the body          |
| `published_at`                                         | kept, set at creation                    |
| —                                                      | added `author_id` (the byline)           |
| —                                                      | added `image_path`                       |
| "No admin/CMS UI planned — direct DB inserts are fine" | superseded: a composer on both platforms |

`exam` turned out to be a tag on content that already lives in the Exam Hub
rather than a kind of announcement, and `livestream` was too specific — the
same post shape carries a livestream link, an Instagram post or any other
social URL, which is what `media` means. An **embedded** player is out of
scope; `media` plus a URL in the body is the seam that makes it additive.
