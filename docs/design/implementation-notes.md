# Quiet-book redesign — implementation notes

What was built from `design.md` and `index.html` (the demo), where the platform could not follow
the demo and what it does instead, and what is left. Branch `feat/quiet-book-redesign`.

## What changed

**Tokens, one source for both platforms.** `packages/ui/src/tokens` holds the demo palette as
`lightColors` / `darkColors` under the app's existing semantic names (`background` = the demo's
`--bg`, `foreground` = `--ink`, `muted` = `--soft`, `border` = `--rule`, …), plus the reading
colours the demo introduced: `paper`, `accent`, the four grade colours with precomputed tints,
`cloze`/`clozeBg`, `highlight0…4`, `scrim`. Page-content colours that never follow the theme
(swatch chips, pen inks) live in `pageColors`. Radii, shadows (CSS strings on web, RN shapes on
mobile), Figtree weights and the type scale are in the same package. On the web, `globals.css`
mirrors them as CSS variables — `globals.tokens.test.ts` fails if the two drift.

**Dark mode is real now.** `settings.theme` (light / dark / system) was stored by the API but never
applied. Web: an inline script sets `data-theme` from the `lp-theme` cookie before first paint;
`ThemeSync` adopts the saved setting; the sidebar's moon button and Settings → Appearance both write
it. Mobile: `ThemeProvider` reads the same field and the device scheme. Book pages and drawings sit
on `paper` (light in both themes) so ink keeps its colour; the web inverts PDF pages in dark mode,
as the demo does.

**Web.** Shared primitives in `apps/web/src/components` (`PageHeader`, `Dot`, `NotchTabs`,
`SegmentedSwitch`, `Chip`/`Tag`, `BottomNotch`, `Toast`, line `icons`), the `field` and
`label-caps` utilities, and every page restyled to them: kicker + title headers, ruled rows
instead of boxed rows, ink buttons, paper only for things that sit on the page. The lesson reader
was split into co-located files and rebuilt around the demo's notches: tabs in a top notch that
keeps the lesson title, a left tool notch, a contents drawer, a resizable Notebook | Chat panel,
word-level marking, the Review bottom bar and cards overlay, and a continuously scrolling PDF
with word highlights, pen and eraser.

**Mobile.** `makeStyles(colors => …)` replaced every module-level `StyleSheet.create`, so styles
follow the theme; it also picks the Figtree family for each weight. The phone tab bar is a bottom
notch, every screen has the kicker + title header, and the lesson screen has the top notch (with
the title line), the left tool notch, side panels and the review bar.

## Deliberate deviations from the demo

| Demo | What the platform does instead | Why |
| --- | --- | --- |
| 3 tabs: Focus · Lecție · Grile | 4 tabs: Lesson · Review · Quizzes · Flashcards | Flashcards is a feature of its own; four fit in the 480px notch. English labels — there is no i18n layer. |
| Again / Hard / Good | Again / Hard / Good / **Easy** (`easy` = accent blue) | The SM-2 scheduler has four ratings; dropping one would change scheduling. |
| Next interval under each grade | Shown after grading, as a toast | The due-card response carries no review state, so it can't be previewed. |
| Cloze type hints, "hide hints" dot | Every gap is "[ … ]"; no hints dot | Cloze cards have no hint field. |
| "See in lesson" on quiz questions, back bar | Built on `questions.source_quotes` (quoted sentences, not offsets) | Quotes survive a lecture-text replace and are what an import author can write (DESIGN-3). Questions show the link only once they have quotes. |
| Favourite heart on questions | Built: ♥/♡ on every question, Favourites view in the Question Bank | New `question_favourites` table (DESIGN-6). |
| TOC of headings with scroll-spy | Two sections: "In this lesson" (headings or the PDF outline) and "Lessons in this chapter" | The existing TOC listed sibling lessons; both are useful. |
| One note per page in the Notebook panel | Pages through this lesson's margin notes and its notebook entries | The platform has two note stores. |
| Editing a note inline | Saved on leave with `PATCH /annotations/{id}` | Added for the redesign (DESIGN-4); the note keeps its id. |
| PDF pages as pre-extracted images | pdf.js canvases, lazily rendered; word boxes from `getTextContent()` | Lessons store the PDF itself. Word highlights needed a backend column (`lesson_page_ink.highlights`, migration `c8e2a5d17f40`) — the redesign's one backend change. |
| AI chat, Explain | Chat tab with a "coming soon" state; Explain disabled with a tooltip | No AI backend yet. |
| No global navigation | Restyled left sidebar (web/tablet), bottom notch (phone); hidden inside a lesson | The platform has seven sections. |
| `--accent` #2F6F9F, `--good` #2F8A4F | #2D6B9A and #267140 in light mode | One step darker to pass WCAG AA (4.5:1) on the page and on their own tints. Dark-mode paper grey and the danger button's text were adjusted for the same reason. |
| Spec screenshots `demo-reference.html` | Compared against `index.html` | That is the file that exists. |

## Expo: known gaps

Verified only by the type checker and jest — no device or emulator was available while this was
built, so every item below, and the screens generally, need a look on Android.

- No `mix-blend-mode`: highlights are plain alpha fills. No `color-mix`: grade tints are precomputed.
- react-native-pdf can't be colour-inverted (pages stay white in dark mode) and exposes no text, so
  PDF word highlights are **display only** on mobile — drawn under the ink in draw mode, made on
  the web. The ink PUT sends strokes only, which leaves highlights untouched on the server.
- Text marking on mobile is two taps (first word, then last) rather than a drag: nested `Text`
  can't report where a finger is mid-drag. It snaps to whole words, like the web.
- No resizable panel (fixed-width side sheets) and no keyboard shortcuts.
- The screen-by-screen pass on mobile was done from the code, by the same roles as the web (ruled
  rows, 16px tiles, 10px fields and buttons, round pills, uppercase section labels). The Expo web
  export can't pre-render to check it visually (a native module needs a device).
- iOS has never been run (INK-10).

## Follow-ups

Tracked as tickets in `TASKS_SPLIT.md`, epic **DESIGN**.
