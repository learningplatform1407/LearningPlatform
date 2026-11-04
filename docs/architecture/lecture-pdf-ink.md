# Lecture PDF and ink annotation

A lesson can carry an **official reference PDF** alongside the admin-authored lecture text, rendered
client-side and drawn on with a finger or stylus. Each learner's ink is private to them and stored
per page.

## 1. Why

A lesson has always been one artifact: an admin uploads a PDF, `extract_pdf` turns it into
`DocumentVersion.extracted_content` blocks, and both clients render those blocks as text. That shape
is what makes highlights, margin notes and cloze deletion possible — they anchor to a `block_index`.

It also throws away the document. Diagrams, tables, equations and page layout do not survive
extraction, and `extract_pdf` outright rejects a scanned or image-only PDF. For a course built
around an official textbook, the book as printed _is_ the material, and a learner wants to annotate
it the way they would a paper copy.

So a lesson now has **two independent artifacts**, not one:

|                | lecture text (`DocumentVersion`)                     | lecture PDF (`LecturePdf`)       |
| -------------- | ---------------------------------------------------- | -------------------------------- |
| what it is     | admin-authored teaching text                         | the official book, as printed    |
| stored as      | extracted blocks, JSON                               | the PDF file, in Storage         |
| text-extracted | yes, `extract_pdf`                                   | **never**, only `validate_pdf`   |
| annotated with | highlights + margin notes, anchored to `block_index` | freehand ink, anchored to a page |
| replaced       | often, carrying annotations forward                  | rarely, wiping all ink           |
| scanned PDF ok | no, `extract_pdf` rejects it                         | **yes** — nothing reads the text |

The second column is why this is not "a flag on `DocumentVersion`". The two artifacts differ in
every row, including the one that matters most: what happens to user annotations when an admin
replaces them.

## 2. Decisions

| Decision                                                               | Rationale                                                                                                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate `lecture_pdfs` table, not a `DocumentVersion` variant         | §1. No `extracted_content`, no versioning, no block anchors — it would be a `DocumentVersion` with half its columns permanently null.               |
| One PDF per lesson, enforced by a unique FK                            | A lesson has one official book. Multiple editions would need an edition-picker in the reader that nothing asks for.                                 |
| Replacing the PDF wipes all ink, unconditionally                       | §3.                                                                                                                                                 |
| Replacing the lecture text carries annotations forward by content hash | §4. The opposite choice, and the asymmetry is the point.                                                                                            |
| Ink stored as a whole `Stroke[]` per page, replaced by PUT             | Matches `NotebookEntry.strokes`, already proven. Per-stroke rows would buy concurrent editing that one user on one page does not need.              |
| Word highlights stored beside the ink, as rectangles                   | §6.2. Same row, same lifecycle (per user, per page, wiped on replace); rectangles in page units so any client can draw them without a text layer.   |
| Stroke points normalized to `[0, 1]`                                   | Zoom-independent: the same array renders correctly at any scale and on any screen, which is also what lets web and mobile share one storage format. |
| `page_count` is the only page metadata stored                          | §5.                                                                                                                                                 |
| Page rendering owned entirely by the clients                           | pdf.js on web, react-native-pdf on mobile. The backend never rasterizes a page; it stores a file and some ink.                                      |
| Ink is per `(pdf, page, user)`, never shared                           | Annotations are personal. There is no "class notes" mode and no sharing surface.                                                                    |

## 3. Replacing the PDF wipes all ink

`upsert_lecture_pdf` is a full wipe-and-recreate: the old row is deleted, `lesson_page_ink` cascades
away with it, and every learner's ink on that lesson is gone.

This is deliberate, and it is the one genuinely destructive operation in the feature. Ink anchors to
a **page number and nothing else**. A new edition of a book repaginates: page 240 of the second
edition is not page 240 of the first. There is no content hash to match on, because nothing reads
the PDF's text — that is the whole premise of §1. Carrying ink forward would therefore mean carrying
it to _arbitrary_ pages, which is worse than losing it: a learner would find their own annotations
scattered across unrelated pages with no way to tell which were misplaced.

Because it cannot be undone, the admin control requires a **two-step confirmation** naming the
consequence ("this permanently wipes every learner's ink on this lesson's PDF"), rather than a
generic "are you sure".

## 4. Replacing the lecture text does not

`replace_lecture_text` is the routine, expected-often operation, and it goes the other way:
highlights and margin notes on text blocks whose content did not change **survive**, even if the
block moved.

`app/documents/diffing.py` hashes each text block and runs `difflib.SequenceMatcher` over the hash
sequences, so a paragraph pushed down by an insertion above it still matches and its annotations are
re-pointed at the new `block_index`.

Two deliberate limits:

- **`autojunk=False` is required.** SequenceMatcher's default treats any value appearing in more than
  1% of a long sequence as noise and refuses to match it, which misfires badly on documents with many
  short repeated blocks (bullet headers, for instance).
- **Image blocks are excluded.** Matching them would mean re-downloading the old image bytes from
  Storage just to hash them. Annotations on an image block die with the old version.

Flashcards, cloze cards and question-bank questions are untouched by either path — they key on
`document_id` alone, not on a version or a block.

## 5. `page_count`, and where validation lives

`validate_pdf` confirms the file opens and has at least one page, and returns the count. Note it does
**not** run text extraction: a scanned, image-only PDF is perfectly valid here, and `extract_pdf`
would reject it.

That count is the only page metadata stored, and it exists for two reasons: a client can label
"page 1 of N" before the file has finished downloading, and the server can bound which `page_number`
is allowed to carry ink. Without it, `page_number` was any integer a client cared to send —
negatives and 2³¹ included — each one eligible for its own row.

The bound is **asymmetric, on purpose**:

- `page_number >= 1` is enforced on both read and write, in the router. Pages are 1-based on both
  clients; 0 and negatives are nonsense either way.
- `page_number <= page_count` is enforced on **write only**, in the service. pymupdf counted
  `page_count` server-side while pdf.js and react-native-pdf each count their own. The two agree for
  any PDF all of them can open, but if they ever disagreed on a real document, refusing the _read_
  would blank a page the user can plainly see, whereas refusing the _write_ only fails the save.
  Reads of an out-of-range page return `[]` and cost nothing.

Both clients additionally clamp navigation to `min(nativePageCount, page_count)`, so a user is never
offered a page they could draw on but not save.

## 6. Clients

Read and draw are **one mode on web and two on mobile**, and the split is forced by the libraries.

On web, pdf.js renders into a `<canvas>` the app owns, so the app knows the page's exact pixel
geometry at all times and can position a transparent ink overlay on top of it. Zoom is the app's own
state, so the overlay follows it.

On mobile, react-native-pdf is a native view that owns its own pan and zoom. Its public API exposes
the current scale (`onScaleChanged`) but **no pan-offset callback at all** — verified against the
installed `index.d.ts`, not assumed. A separately-rendered overlay therefore cannot be kept aligned
while the user pans a zoomed page. So:

- **Read mode** — the native view owns pinch-zoom and pan, exactly like any PDF viewer. Ink is
  hidden.
- **Draw mode** — the page locks to a fit-width scale with `scrollEnabled={false}`. The geometry is
  now pinned and known, so the overlay can match it exactly.

The consequence worth stating plainly: on mobile, **ink is not visible while reading**. Seeing your
own annotations means entering draw mode. That is a real cost of the no-pan-offset constraint, not a
preference.

### 6.2 Highlights on PDF pages (web only)

Web PDF mode also has the reader's word-level marker. pdf.js's `getTextContent()` gives runs of text
with positions; `pdf-geometry.ts` splits them into word boxes, and a drag snaps to whole words.

What is stored is the result, not the words: `lesson_page_ink.highlights` holds `{ color, rects }`,
one rectangle per run of words on a line, in `[0, 1]` page units like stroke points. That keeps the
same three properties the ink has: zoom-independent, renderable by any client (mobile can draw them
with no text layer at all), and stable across a pdf.js upgrade that segments text differently.

Two rules keep the clients from treading on each other:

- **`highlights` is optional on the PUT.** Omitted, the stored highlights are left alone; a list,
  even an empty one, replaces them. Mobile cannot make highlights and only sends `strokes`, so its
  saves never wipe the web's.
- **Creating highlights needs a text layer**, so it is web-only, and a scanned page (no text) says
  so instead of failing silently.

Nothing new is needed on PDF replace: the highlights are in the same row as the ink, and §3's
cascade takes both.

### 6.1 Three gotchas worth keeping

**The pdf.js worker is a vendored static file.** `apps/web/public/pdf.worker.min.mjs` is a committed
copy of pdfjs-dist's build output, loaded from an absolute URL rather than a bundler
`new URL(..., import.meta.url)` reference, which is not reliably supported across both Turbopack and
webpack. Two consequences: **re-copy it whenever `pdfjs-dist` is bumped** (a version mismatch between
API and worker is a hard failure), and `proxy.ts` must exclude `.mjs` from the session check — the
worker is fetched as a plain subresource, and a redirect hands it an HTML login page it cannot parse.

**A pdf.js render must be cancelled, not just abandoned.** pdf.js tracks in-use canvases in a
module-level set and throws `Cannot use the same canvas during multiple render() operations` if a
second render starts before the first finishes. A `cancelled` boolean checked after the `await` is
not enough — the in-flight render keeps going. Hold the `RenderTask` and `.cancel()` it in effect
cleanup, and treat `RenderingCancelledException` as the normal path. Two quick Zoom clicks is enough
to hit this, and the symptom is a blank page with no error.

**Every undo step names its page.** On web, every page now has its own ink layer (the pages scroll
as one column), but undo is one stack for the whole lesson, and each entry records the page it
belongs to and that page's previous `{ strokes, highlights }`. Undoing writes that snapshot back to
_that_ page. An undo that only remembered the strokes would put them on whichever page is in view.
On mobile, one `DrawingCanvas` is still reused across pages, and its `pageKey` prop guards the same
mistake by discarding its history on a page turn.

## 7. Status and `error_message`

Processing happens inline, so `PUT /v1/documents/{id}/pdf` returns `200` with `status: "failed"` and
a reason in `error_message` when a PDF does not validate — it is not an HTTP error.

Both ends of that have to be read, or the failure is silent at both:

- The **learner-facing toggle renders only for `status: "ready"`.** A failed PDF offering a PDF mode
  that cannot load dead-ends the learner, and the text lesson is still perfectly readable.
- The **admin upload control checks the returned status**, not just the HTTP code, and surfaces
  `error_message` — otherwise the admin who uploaded a corrupt file sees success while learners
  silently never get the toggle.

## 8. Mobile needs a dev client

`react-native-pdf` and `react-native-blob-util` are bare native modules. **Expo Go cannot load
them**, so the PDF reader is unavailable there and the screen fails at the native boundary rather
than degrading.

Running or shipping it needs a custom dev client:

```bash
cd apps/mobile
npx expo prebuild        # generates ios/ and android/
npx expo run:android     # verified; iOS is untested -- see §8.3
```

Both packages support the New Architecture, which RN 0.88 / Expo SDK 58 require —
`react-native-pdf@7.0.5` ships a Fabric `codegenConfig`, checked against the installed package
rather than assumed. Neither needs an Expo config plugin; standard autolinking picks them up during
prebuild.

### 8.1 What `prebuild` alone does not get you

Three things sit between "prebuild succeeded" and a rendered page. All found the hard way.

**`trustAllCerts={false}` is mandatory, not a preference.** `react-native-pdf` defaults
`trustAllCerts` to `true` (`index.js:103`) and forwards it as `trusty` to react-native-blob-util,
which routes the download through `getUnsafeOkHttpClient`. That function throws outright —
`IllegalStateException: Use of own trust manager but none defined` — because its shared trust
manager is never initialised. **Every HTTPS PDF fails to load under the default prop.** Turning it
off is also the correct posture: that path installs an all-trusting `TrustManager` plus a
`hostnameVerifier` returning `true` for every host, defeating TLS on a signed Supabase URL.

**`ANDROID_HOME` must be set, and the SDK must be current.** Gradle reports `SDK location not found`
without it, and `spawn emulator ENOENT` has the same cause. Separately, Expo SDK 58's own modules
require **`compileSdk 37`**: `checkDebugAarMetadata` fails naming 20+ dependencies
(`expo.modules.router`, `expo.modules.image`, AndroidX Compose…) if you compile against 36. Pinning
lower through `expo-build-properties` does not work — 37 is a floor, not a default worth overriding.
An Android Studio more than a release or two old will not list API 37 at all, which makes it look
preview-only when it is not.

**`EXPO_PUBLIC_API_URL` must be reachable from the device.** On a physical phone that is the host's
LAN IP; on an emulator, `10.0.2.2` is the host alias. `localhost` means the device itself. The
backend must also bind `--host 0.0.0.0`, as uvicorn's default `127.0.0.1` is unreachable either way.
Login works regardless — it talks to Supabase directly — so a wrong API URL presents as "logged in,
every lesson fails", which points away from the real cause.

### 8.2 Overlay geometry

The overlay size in draw mode comes from `onLoadComplete`'s reported page size and the container's
own **measured** width (`onLayout`), because react-native-pdf does not expose the native view's
rendered page bounds to JS. Deriving it from window width minus an assumed parent padding looks
equivalent and silently misaligns the ink as soon as that padding changes or the device rotates.

Verified on an Android emulator: ink drawn on web renders in the right place inside the native view,
and ink drawn on the emulator renders in the right place on web. That round-trip in both directions
is the real test of the `[0, 1]` normalisation in §2 — two renderers, one storage format, no
conversion layer.

### 8.3 iOS is unverified

**Everything above was confirmed on Android only.** The reader has never been built or run on iOS,
so treat this section as a checklist rather than a description.

Building it needs **full Xcode**, not just the Command Line Tools — `xcode-select -p` pointing at
`/Library/Developer/CommandLineTools` means `xcodebuild` does not exist and `expo run:ios` cannot
work. CocoaPods is a separate prerequisite and is not sufficient on its own.

Four things are known to differ, and none of them have been exercised:

- **The `trustAllCerts` failure was diagnosed in `ReactNativeBlobUtilUtils.java`** — Android-specific
  code. iOS has its own networking implementation, so that exception may not arise there at all. The
  prop is set to `false` for both platforms regardless, because trusting every certificate is wrong
  on either, but whether iOS _needed_ it is unknown.
- **Overlay geometry** (§8.2) depends on what react-native-pdf's native view reports to
  `onLoadComplete` and what the container measures via `onLayout`. The JS is shared; the native
  view is not. Misalignment between ink and page is the thing to look for first.
- **Safe-area insets.** `edgeToEdgeEnabled` is an Android Gradle property, so the specific mechanism
  in HARDEN-9 does not apply — but nothing in `apps/mobile/src` handles insets at all, and a notch
  or Dynamic Island makes iOS _more_ likely to clip the reader's top control row, not less.
- **Session storage.** `LargeSecureStore` keeps its AES key in `expo-secure-store`, which is the iOS
  Keychain rather than the Android Keystore. The pattern is cross-platform but has only run against
  the Keystore.

## 9. Storage cleanup never fails the caller

Both replace paths discard superseded objects from Storage _after_ their database commit, via
`_discard_object`, which catches `Exception` broadly and logs.

This is the same contract `app/feed/service.py::_discard_image` documents, and it is worth restating
because the narrow version has now been written twice. `delete_object` raises `RuntimeError` when
Storage is unconfigured and httpx `ConnectError`/`ReadTimeout` from the transport; none of these
subclass `StorageError`. A guard that enumerates failure types means re-deriving httpx's hierarchy
correctly forever, and getting it wrong means a request whose database work already committed returns
a 500 for work that in fact succeeded. An orphaned object in Storage is benign. The contract is
simply **never fail the caller**.
