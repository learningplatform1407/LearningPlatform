# Mobile PDF reader: one canvas, one transform

A plan, not a record of something built. It replaces the mobile lecture-PDF
reader — `react-native-pdf` with React Native views positioned on top of it —
with the shape every serious reader-and-annotate app uses: **page and ink in
one surface, in one coordinate space, under one transform.**

Read [`lecture-pdf-ink.md`](./lecture-pdf-ink.md) first. Everything about
_what_ is stored stays true; this changes only how mobile draws it.

## 1. Why the current reader cannot get there

Today each page is its own fixed-size native `<Pdf>`, with React Native views
(highlights, ink, the mark layer) absolutely positioned over it in screen
points. That design has three ceilings, and the first two are structural
rather than bugs to be fixed:

| Ceiling                              | Why                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zoom goes soft                       | The page is a bitmap rendered once at fit-width and transform-scaled. Past about 2× it is magnified pixels.                                                                                                                                                                                                                                     |
| Overlays cannot follow a panned page | `react-native-pdf` reports `scale` but **no pan offset**, so anything drawn on top can only guess where the content went. This is why its own gestures are turned off.                                                                                                                                                                          |
| It crashes                           | `PdfManager.onAfterUpdateTransaction` posts `drawPdf()` unconditionally, and `drawPdf()` → `Configurator.load()` → `recycle()` closes the pdfium document while the render thread may still be drawing it. Detaching a view recycles too. Upstream fix [#1053](https://github.com/wonday/react-native-pdf/pull/1053) is open and in no release. |

The third is survivable with a vendored patch. The first two are not: they are
what the library _is_.

## 2. What the good ones do

Consistent across GoodNotes, Notability, PDF Expert, Apple Books and Acrobat:

1. **One coordinate space — the page.** Ink is vectors in page coordinates,
   never screen pixels. _We already do this_, and it is why none of what
   follows needs a data migration.
2. **One transform over page and ink together.** No screen-positioned
   overlay. Where two scroll views must be stacked (PDFKit's `PDFView` and
   PencilKit's `PKCanvasView` are both `UIScrollView`s), the accepted fix is
   to synchronise `zoomScale` and `contentOffset` between them. Our drift is
   exactly the failure that synchronisation prevents.
3. **The page is re-rasterised at the current zoom, in tiles.** Nobody
   bitmap-scales a page; that is the blur. Vector ink is re-stroked at the new
   scale, so it stays crisp at any zoom.
4. **Pencil and finger are different inputs.** Pencil draws, finger pans and
   zooms, with no mode switch.

Point 4 is worth the most to this product: a tablet-and-Pencil study app
should not make anyone put a tool down to scroll. Our **web** reader already
does it right (`pointerType === "pen"`, the `penSeen` rule); mobile is the
platform that doesn't.

## 3. The design

### 3.1 Page images come from the backend

A new endpoint renders a page with pymupdf, which the API **already depends
on** and already uses for `GET /pages/{n}/words`:

```
GET /v1/documents/{document_id}/pages/{page_number}/image?scale={1|2|3}
    → image/webp
```

- `page.get_pixmap(matrix=pymupdf.Matrix(scale, scale))`. The PDF bytes are
  already held in an `lru_cache(maxsize=4)` by storage path
  (`app/ink/service.py::_lecture_pdf_bytes`), so the file is not
  re-downloaded per page.
- **Discrete scale steps, not arbitrary zoom.** A client asks for the
  smallest step at or above its current zoom. Three steps keep the cache
  small and make a page image immutable for a given
  `(lecture_pdf, page, scale)` — so it can carry a long `Cache-Control` and
  be stored rather than re-rendered.
- Same auth as the words endpoint: any signed-in reader.

This is the pivotal choice, so the alternative deserves stating. A native
rasteriser (`react-native-pdf-renderer`, or Android `PdfRenderer` / iOS
PDFKit directly) keeps the bytes on the device and costs no bandwidth, but
keeps a native PDF dependency and a second rendering implementation to keep
matched against the web's. Rendering server-side **deletes
`react-native-pdf`**, reuses code we already run, and makes mobile composite
a page image with vector layers — exactly what the web reader already does
with pdf.js and SVG. One design, two clients.

The cost is real and is measured in phase 1 before anything depends on it:
bytes per page at each scale, and what a 400-page book implies for storage.

### 3.2 Page and ink in one Skia canvas

`@shopify/react-native-skia` (**not currently installed**), one `<Canvas>`
per page, drawing in page coordinates:

- the page image for the current scale step,
- highlight rectangles and quiz-source paint,
- ink, as `Skia.Path` built from the stored stroke points.

Ink is re-stroked every frame at the current scale, so it is crisp at 3× in a
way a scaled bitmap can never be. Stroke width stays a fraction of the page,
as stored.

### 3.3 One gesture surface

`react-native-gesture-handler` (installed, so far unused) composing
`Gesture.Pinch()` and `Gesture.Pan()` into Reanimated shared values for
`scale`, `translateX`, `translateY`, applied as one transform over the page
column.

- **Focal-point zoom**: the content point under the fingers stays under the
  fingers. The current reader scales about the column's centre and leaves the
  scroll offsets alone, which is why zoom drifts.
- In PDF mode the column owns pan **and** zoom, so it stops living inside the
  lesson's vertical `ScrollView`. This is the largest structural change in
  the plan and gets its own ticket.

### 3.4 Pencil and finger

Verified available: `react-native-gesture-handler@3.3.0` exports
`PointerType.STYLUS`, and every gesture event carries `pointerType`.

- stylus → draw or erase, whatever tool is in hand;
- touch → pan and zoom, always.

Which retires "put the tool down to scroll" on mobile. Until a stylus has
been seen, a finger should still draw, exactly as the web decides it
(design.md §10) — otherwise a phone with no pencil could not annotate at all.

### 3.5 What does not change

**Nothing stored.** Strokes stay page-normalised with margin ink outside
`[0, 1]`; highlights stay rectangles in page units; `lesson_page_ink` is
untouched. No migration, and ink written on web keeps landing in the right
place on mobile. That is the dividend of having got the coordinate space
right the first time.

Margins stay unconditional on mobile (ink doc §6.2.1) **until phase 3 lands**,
at which point the reason evaporates: with no `<Pdf>` there is no `recycle()`
to race, and the toggle can come back.

## 4. Phases

Each leaves the app working and is reviewable alone.

| Phase | What                                                                                                                                                                                                                                                                         | Ships                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **0** | Stop the crashing on what exists today: vendor [#1053](https://github.com/wonday/react-native-pdf/pull/1053) with `pnpm patch`, and window pages by **index** (current ± N) rather than by pixel span, so a zoom or a margins change cannot re-window several pages at once. | Independently, now          |
| **1** | The page-image endpoint and its cache, with tests. No client change. Measure bytes per page per scale.                                                                                                                                                                       | Independently               |
| **2** | Skia canvas renders page image + highlights + ink, still inside today's `ScrollView`, no zoom yet. Proves parity: a mark made before the change sits where it sat.                                                                                                           | Behind a flag               |
| **3** | One gesture surface: focal-point pinch, pan, page-index windowing. `react-native-pdf` and `pdf-lesson-view.web.tsx` deleted. Margins toggle restored.                                                                                                                        | The payoff                  |
| **4** | Stylus draws, finger pans. Retire "put the tool down to scroll" on mobile.                                                                                                                                                                                                   | The payoff for tablets      |
| **5** | Tiling, **only if measured as needed**: whole-page images at 3× may be perfectly affordable, and tiles are a lot of machinery to add on a guess.                                                                                                                             | If phase 1's numbers say so |

## 5. Risks, and what to do about them

| Risk                                             | Handling                                                                                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skia is a new native dependency                  | Means `prebuild` and a dev-client rebuild — which wipes `android/local.properties` and the iOS signing settings every time (ink doc §8). Budget for it; do it once, at phase 2.  |
| Bandwidth and storage for page images            | Measured in phase 1 before anything depends on it. Three scale steps, immutable per step, long-lived cache.                                                                      |
| Taking PDF mode out of the lesson's `ScrollView` | Its own ticket in phase 3. Tab switching, the review bar, the tool notch and the side drawers all assume one scroll container.                                                   |
| Skia under Jest                                  | Needs its own mock; confirm it ships one before phase 2 commits to it. Keep geometry in pure modules (`pdf-zoom.ts` already is one) so most logic is testable without rendering. |
| Gesture arbitration                              | The thing jsdom cannot tell us about, and where the last two attempts went wrong. Phases 3 and 4 each need device time on Android **and** an iPad before being called done.      |
| Big change to the riskiest file                  | Phases 2 and 3 are flagged, so the old reader stays reachable until the new one is trusted on a device.                                                                          |

## 6. What this does not do

- **Web is untouched.** pdf.js renders client-side and works; it gains
  nothing from a server-rendered page. The two readers converge in _design_ —
  page image plus vector layers — not in implementation.
- **No re-anchoring of marks across a lecture-text replace.** Still the
  separate, shared problem it was (ink doc §4).
- **Not a commercial SDK.** Nutrient or Apryse would hand us all four
  properties of §2, including pencil separation, for money and a loss of
  control over the reader's design. If these phases start slipping, that is
  the honest fallback rather than a failure.
