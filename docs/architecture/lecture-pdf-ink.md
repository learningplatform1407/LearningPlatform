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
| Word highlights stored beside the ink, as rectangles                   | §6.1. Same row, same lifecycle (per user, per page, wiped on replace); rectangles in page units so any client can draw them without a text layer.   |
| Stroke points normalized to `[0, 1]`                                   | Zoom-independent: the same array renders correctly at any scale and on any screen, which is also what lets web and mobile share one storage format. |
| Ink in a writing margin stored _outside_ `[0, 1]`                      | §6.2. The page stays the coordinate system; a margin is a wider window onto it, so turning margins on changes nothing already drawn.                |
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

Read and draw are **one mode on both platforms**.

On web, pdf.js renders into a `<canvas>` the app owns, so the app knows the page's exact pixel
geometry at all times and can position a transparent ink overlay on top of it. Zoom is the app's own
state, so the overlay follows it.

On mobile, react-native-pdf is a native view that owns its own pan and zoom. Its public API exposes
the current scale (`onScaleChanged`) but **no pan-offset callback at all** — verified against the
installed `index.d.ts`, not assumed. A separately-rendered overlay therefore cannot be kept aligned
while the user pans a zoomed page.

So mobile does not use one zoomable viewer. Like the web, it shows a **column of page cards**, each
its own `singlePage` native view at a fixed fit-width size with touches off. A page that never pans
or zooms has known geometry, so its highlights and ink sit exactly on it and are always visible, and
the tools in the lesson's tool notch (markers, pen, eraser) work on it directly. Only pages within a
screen of the visible area are rendered; the first page loads before the rest, because its download
fills react-native-pdf's file cache (`source.cache`, keyed by the storage path, which a replacement
never reuses) that the other pages then read from.

The cost: no pinch-zoom on mobile. While the pen or eraser is up, a drag draws or erases, so the
lesson stops scrolling until the tool is put down.

### 6.1 Highlights on PDF pages

Web PDF mode also has the reader's word-level marker. pdf.js's `getTextContent()` gives runs of text
with positions; `pdf-geometry.ts` splits them into word boxes, and a drag snaps to whole words.

What is stored is the result, not the words: `lesson_page_ink.highlights` holds `{ color, rects }`,
one rectangle per run of words on a line, in `[0, 1]` page units like stroke points. That keeps the
same three properties the ink has: zoom-independent, renderable by any client (mobile can draw them
with no text layer at all), and stable across a pdf.js upgrade that segments text differently.

Two rules keep the clients from treading on each other:

- **`highlights` is optional on the PUT.** Omitted, the stored highlights are left alone; a list,
  even an empty one, replaces them. A strokes-only save (an older mobile build) never wipes them.
- **Creating highlights needs the page's words**, and a scanned page (no text) says so instead of
  failing silently.

react-native-pdf exposes no text, so mobile gets the words from the server:
`GET /v1/documents/{id}/pages/{n}/words` returns each word with its box in the same page units and a
`line` id, read with pymupdf (`page.get_text("words")`, turned by the page's rotation matrix into the
page as displayed). Mobile marks by two taps, the first word and the last, and joins the words of
each line into one rectangle, the same shape the web stores. The PDF's bytes are kept in a small
in-process cache by storage path, so reading page after page doesn't download the file each time.

Nothing new is needed on PDF replace: the highlights are in the same row as the ink, and §3's
cascade takes both.

### 6.2 Writing margins

Every page can have a strip either side to write notes in. **On web it is a
toggle** in the lesson's tool notch (`M`), off by default — a reader's
preference, not a property of the PDF, so two people reading the same lesson
can disagree. **On mobile every page simply has them**, with no toggle; §6.2.1
is why.

**The page remains the coordinate system.** A margin is 18% of the page's
width, and ink in the left one lands at an `x` between `-0.18` and `0`, in the
right one between `1` and `1.18`. `y` stays in `[0, 1]`, because the margins
are exactly as tall as the page. That single decision is what makes the
feature cheap:

- Every stroke drawn before margins existed renders exactly where it did.
  Nothing migrates, and no stored array is rewritten on load.
- A note written beside the text on the phone appears in the same place on the
  web, since both platforms use the same fraction and the same units.
- The eraser, the undo stack and the save payload need no changes at all — a
  margin stroke is a stroke.
- The backend needed no change either: `StrokePoint.x` was never bounded (only
  **highlights** are clamped to `[0, 1]`, in `app/ink/schemas.py`, and they
  stay that way because they anchor to words on the page).

The page shrinks to make room rather than the column growing, so turning
margins on at 100% zoom never introduces a sideways scroll. The margins are
rounded to whole pixels first and the page takes the remainder, so the three
add up to exactly the width available — rounding the page instead left it a
fraction of a pixel too wide, which is a scrollbar. The clients derive the
margin's size in page units from that rounded pixel width rather than from the
nominal 18%, so a point on the page maps to the coordinate it always had.

What stays on the page: highlights (word-anchored), quiz-source paint, the
heading flash, and the press-and-hold mark gesture, which measures touches
against the page's own width. What spans the margins: the ink layer and the
pointer surface that draws into it.

The ink layer spans the margins but still sits **inside** `.book-page`, the
element carrying dark mode's `invert(.9) hue-rotate(180deg)` (design.md §13),
so page and ink invert as one unit as they always did. Widening that layer
without moving the filter with it left ink its drawn colour over a page that
had flipped — graphite on a now-dark page. The margin tints are deliberately
left outside the filter: they are theme colours that already follow the
theme, and inverting them a second time would undo that. Mobile is unaffected
either way, since React Native has no equivalent filter and never inverted
pages. Margin strips are tinted only while the
pen or the eraser is in hand — a faint panel beside every page of a 400-page
book is noise, but at the moment the pen comes out it is the only thing that
says "you can write here".

**Turning margins off (web) hides their ink, it never deletes it.** Both ink
layers clip to the page and its margins, so with the margins gone that box is
only the page and a stroke beside it falls outside. The same clip is what
keeps ink drawn past mobile's margins — nothing does today, since both
platforms use the same fraction — out of the gutter beside the page. The strokes stay in
`lesson_page_ink.strokes` and every later edit still saves them, because both
clients build a save from the full stored array rather than from what is on
screen; turning margins back on brings them back exactly where they were. The
web layer had to stop being `overflow-visible` for this — it was letting
margin ink paint into the gutter beside the page instead of disappearing with
the margins it was drawn in. Nor can new margin ink be made while they are
off: the pointer's x is clamped to the margins that exist, which is none.

One thing the margins did **not** cause, found while testing them: with the
pen in hand the mobile tool notch holds fourteen buttons, which at 34pt
apiece ran from 30% down the screen to past the bottom of it -- and the
bottom tab bar sits over that, so the last of them (the rule and `Aa`) could
be neither seen nor tapped. It is now capped at 58% of the screen and
scrolls, which with the 30% offset always leaves room below for the tab bar
and the safe area. Latent since the notch gained the pen's nib sizes; the
margins only made it somewhere people linger.

#### 6.2.1 Why mobile has no toggle

Toggling margins resizes every page. On mobile that meant, in one frame: a new
`style` width and height on every mounted `<Pdf>`, so every visible page
re-renders its bitmap; and a shorter page, so more fit on screen and several
more `<Pdf>` instances mount, each opening the same file.

AndroidPdfViewer renders bitmaps on its own `HandlerThread` and recycles the
`PdfDocument` when a view detaches, without cancelling the jobs already queued
against it. A burst like the above reliably lands one of those jobs on a
recycled document:

```
java.lang.RuntimeException: Get page pdf document null
  io.legere.pdfiumandroid.PdfDocument.nativeLoadPage
  io.legere.pdfiumandroid.PdfiumCore.renderPageBitmap
  com.github.barteksc.pdfviewer.RenderingHandler.handleMessage
```

That race is the library's and is not ours to fix. What is ours is not to put
a button on it. Constant margins mean a mobile page's size changes only on
rotation — exactly the exposure it had before margins existed, which is also
why this was never seen before.

So the toggle is web-only, where pages are plain DOM and a resize is free. The
cost on mobile is a page about 73% of the column's width whether or not anyone
writes beside it, which is the trade: a smaller page, or a feature that
crashes the app. Giving mobile a narrower margin to claw some of that back is
**not** a free change — the fraction is what the stored x range means, so the
two platforms would stop agreeing on where a margin note sits.

#### 6.2.2 Pinch to zoom, and why the toggle still cannot come back

Mobile zooms by pinch instead (`apps/mobile/src/lib/pdf-zoom.ts`), which is
the stable-width idea above, built: the `<Pdf>` is rendered at the fit-width
**base** size and never re-rendered, and zoom grows the layout box the page
occupies. The page image is transform-scaled into that box, anchored
top-left with `transformOrigin`, which costs sharpness past about 2×.
Everything else — the row, the margins, the highlights, the mark layer, the
ink canvas — is laid out at the zoomed size, so it stays crisp and keeps
sitting exactly where it sat. Stored ink is a fraction of the page either
way, so nothing about zoom reaches the server and a stroke drawn at 3× is in
the same place at 1×.

`react-native-pdf` does expose `scale`/`minScale`/`maxScale`/
`onScaleChanged`, and it is still no use here: it reports no **pan** offset,
so the overlays could not follow content that panned without guessing. That
is why its gestures were turned off to begin with.

The gesture is the Responder system rather than `react-native-gesture-handler`
— which is installed but used nowhere in the app, while every gesture in this
file is already raw responder, and mixing the two around the drawing canvas
is the sharp edge. A pinch is claimed only when two fingers are down **and no
tool is in hand**: the same "put the tool down to scroll" rule the pen
follows, which also keeps it clear of the drawing responder entirely. During
the pinch the fingers get a transform on the page column — answered at once,
nothing laid out underneath — and the zoom commits on release, so there is
one layout change per gesture rather than sixty a second. Zoomed in, a
horizontal `ScrollView` pans the page; at fit-width it is inert.

Zoom here is an interim: it is a bitmap scaled past its rendered size, and
the overlays still sit on the page rather than under one transform with it.
[`mobile-pdf-canvas.md`](./mobile-pdf-canvas.md) plans the replacement — page
and ink in one Skia surface — and that is where the toggle below, pencil-vs-
finger, and sharpness at 3× all come from.

**This does not bring the margins toggle back.** Zoom is safe because the
base size does not depend on it. A margins toggle is not: the margins come
out of the column's width, so turning them off makes the page itself wider —
a new base size, and a resized `<Pdf>`. Making it safe would mean always
rendering at the margined base size and treating "margins off" as a 1.36×
zoom, which would leave the ordinary fit-width case looking at a scaled
bitmap. Not worth it; margins stay unconditional here.

### 6.3 Three gotchas worth keeping

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

Each page card's size comes from the first page's `onLoadComplete` size (its aspect ratio) and the
column's own **measured** width (`onLayout`), because react-native-pdf does not expose the native
view's rendered page bounds to JS. Deriving it from window width minus an assumed parent padding looks
equivalent and silently misaligns the ink as soon as that padding changes or the device rotates.

Verified on an Android emulator: ink drawn on web renders in the right place inside the native view,
and ink drawn on the emulator renders in the right place on web. That round-trip in both directions
is the real test of the `[0, 1]` normalisation in §2 — two renderers, one storage format, no
conversion layer.

### 8.3 iOS

**Everything above was confirmed on Android first.** The reader has since been run on an iPhone,
which found one thing this file had not predicted, below; the rest of this section is still a
checklist rather than a description.

**The page takes no touches.** `scrollEnabled={false}` stops the native viewer from scrolling, but
it does not stop it from _claiming_ the gesture: on iOS, PDFKit's own scroll view swallowed every
drag that began over a page, so dragging on the lesson scrolled nothing and only the gaps beside the
pages worked. The page subtree is wrapped in a `pointerEvents="none"` layer
(`apps/mobile/src/lib/pdf-lesson-view.tsx`), which costs nothing: zoom and paging are already off,
and marking and ink are sibling layers above it, so they still receive their touches. Android
tolerated the same markup, which is why Android testing never surfaced it.

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
  in HARDEN-9 does not apply. `app/_layout.tsx` now pads every screen by `insets.top`, and
  `ThemeProvider` paints the window behind the root view with the theme's background
  (`expo-system-ui`) — without that, the strip under the notch showed the platform's own window
  colour, a shade off the page in light mode and the wrong colour entirely in dark. A notch or
  Dynamic Island still makes iOS more likely to clip the reader's top control row than Android.
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
