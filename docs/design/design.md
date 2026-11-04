# Task: Restyle the platform to match the design demo

## Context

The platform is functionally mostly complete: a Next.js + TypeScript web app and an Expo/React Native app in a pnpm monorepo, with a FastAPI backend. We are now doing the **visual design pass**. The target look and feel is a standalone HTML demo ("Demo platformă rezidențiat") built for medical-residency exam prep. It shows one lesson (Ortopedie I) in three tabs: **Focus**, **Lesson** and **Quizes**.

Read both before writing any code. If this spec and the HTML disagree on a pixel value, the HTML wins.

## Ground rules

1. **This is a design pass, not a rewrite.** Do not change API contracts, data models, backend code, auth, or business logic. Restyle and restructure the existing components to match the demo style. Where a component's markup has to change to achieve the layout, keep its props and data flow intact. Note: the demo is not completely accurate and does not completely reflect our functionalities, it is purely an example of style that we want to have in our platform.
2. **Inspect first.** Before editing, map the existing web app's routes and components to the demo's zones (top notch, tool notch, table of contents, right panel, lesson column, Review bar, Quiz list).
3. **Don't copy the demo's shortcuts.** The demo stores everything in `localStorage`, hardcodes lesson data, mocks the AI chat, and shows fixed spaced-repetition intervals as labels. Keep the platform's real persistence, data fetching and logic. Copy only the look, layout and interaction feel.
4. **Tokens first.** All colours, radii, shadows and type sizes become design tokens in one place before any component work. No hardcoded hex values in components, except the few page-content colours called out below.
5. **Keep existing UI copy.** The demo's labels (Romanian) are listed for reference. Use the app's existing strings or i18n keys where they exist.
6. **Web first, then mobile.** Implement on the web app first. Put tokens in a shared package (e.g. `packages/ui` or a new `packages/design-tokens`) so the Expo app can consume the same values. Mirror the layout on Expo where React Native allows it, and list any gaps at the end.
7. **Design fits the implementation** Check and make sure that this proposed design fits the implementation that we already have. If anything is not fine, mention it and make different suggestions.

## Design principles

- **A quiet book.** Warm off-white background, graphite text, one blue accent
- **The lesson owns the centre.** All controls live in "notches": Title page/lesson and small panels (lesson, review, quizes, etc) glued to a screen edge, with rounded corners **only on the side facing the screen** and a soft shadow.
- **Panels slide over, they don't push.** The table of contents and the right panel slide over the page in 0.25 s.
- **Word-level marking.** Highlights, notes and quiz sources attach to words, not to the browser's native selection, so they stay stable across screen sizes.

## 1. Design tokens

Define these as CSS custom properties on `:root`. Map them into Tailwind (or the existing styling system) if the app uses one.

```css
:root {
  --bg: #f7f6f2; /* page + notch background */
  --paper: #ffffff; /* cards, Anki grade buttons */
  --ink: #1d1f23; /* text, filled buttons */
  --muted: #6c6f76; /* secondary text, unselected tabs */
  --rule: #dedbd2; /* 1px lines and borders */
  --soft: rgba(110, 110, 120, 0.13); /* active pill, pressed/hover fill, AI bubble */
  --accent: #2f6f9f; /* links, Focus gaps, notes */
  --red: #c8372d; /* favourite heart */
  --again: #c8372d;
  --hard: #c27a10;
  --good: #2f8a4f;
  --cloze: #2f6f9f;
  --cloze-bg: rgba(47, 111, 159, 0.1);
  /* highlighter fills: yellow, blue, purple, red, green */
  --h0: rgba(255, 212, 0, 0.45);
  --h1: rgba(80, 170, 255, 0.35);
  --h2: rgba(170, 110, 255, 0.33);
  --h3: rgba(255, 90, 90, 0.33);
  --h4: rgba(80, 200, 110, 0.35);
  --sans: "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
  --shadow: 0 8px 22px rgba(0, 0, 0, 0.08);
  --chatw: 380px; /* right panel width, user-resizable */
}
```

Dark values (see section 13 for how dark mode is applied):

```css
--bg: #17181b;
--paper: #f4f2ec;
--ink: #e9e8e4;
--muted: #a2a39f;
--rule: #34363b;
--soft: rgba(200, 200, 210, 0.13);
--accent: #7db3db;
--gold: #e3b23c;
--hot: #ef7a52;
--red: #e0574c;
--again: #e0574c;
--hard: #e0a03a;
--good: #5cbf7d;
--cloze: #86bfe6;
--cloze-bg: rgba(134, 191, 230, 0.14);
--h0: rgba(255, 212, 0, 0.32);
--h1: rgba(80, 170, 255, 0.32);
--h2: rgba(170, 110, 255, 0.34);
--h3: rgba(255, 90, 90, 0.32);
--h4: rgba(80, 200, 110, 0.3);
--shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
```

Fixed, non-themed colours (these sit on the lesson page itself):

| Use                                                     | Value                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Toolbar swatch chips (yellow, blue, purple, red, green) | `#f5c400`, `#4ea8ff`, `#9b6bff`, `#f05a5a`, `#3cb46e`                                  |
| Pen ink, same colour order                              | `#d9a400`, `#1e7fe0`, `#7d4fe0`, `#d93636`, `#2f9e55`                                  |
| Quiz-source highlight on PDF                            | fill `rgba(255,140,0,.22)`, `box-shadow: inset 0 -2px #ff7a00` (text mode: fill `.24`) |
| Note anchor underline on PDF                            | `border-bottom: 2px dashed #2f6f9f` (text mode uses `var(--accent)`)                   |
| Note selection in progress                              | `rgba(47,111,159,.16)`                                                                 |
| Note bubble                                             | `#2f6f9f` with a white icon                                                            |
| "Jump to heading" flash                                 | `rgba(255,200,0,.5)`                                                                   |

## 2. Typography

- One font: **Figtree** (Google Fonts, weights 400, 500, 600, 700, 800), loaded with `next/font` on web. Use the same family in Expo via `expo-font`.
- Body and lesson text: **17px, line-height 1.6, weight 500**. Buttons inherit the font.
- Lesson title (h1): `clamp(26px, 4vw, 34px)`, line-height 1.15, weight 800, margin `6px 0 4px`, `text-wrap: balance`.
- Kicker above the title (e.g. "ORTOPEDIE I · LECȚIE"): 12px, uppercase, letter-spacing .14em, weight 700, `--muted`.
- Section heading (h3): 22px, line-height 1.25, weight 800, `text-wrap: balance`.
- The **Aa** control scales the Lesson and Review text by steps between 100% and 150%.

## 3. Page shell

- `body`: background `--bg`; horizontal padding `max(16px, env(safe-area-inset-*))`; bottom padding 140px, so content clears the Review bar.
- Respect safe areas: add a fixed strip of `--bg` the height of `env(safe-area-inset-top)` so content never shows under a notch.
- Reading column: responsive.
- Section anchors: `padding-top: 24px; scroll-margin-top: 88px`.
- Lesson header block: `padding: 30px 0 6px`.

## 4. Top notch (tabs)

- Sticky at `top: env(safe-area-inset-top)`, centred, z-index above content.
- Container: `width: min(480px, 100%)`, `--bg` background, `1px solid var(--rule)` border **with no top border**, radius `0 0 22px 22px`, `--shadow`, padding `6px 14px 8px`.
- Equal tabs: Lesson · Review · Quizes. etc. Each is 15px, weight 600, `--muted`, padding `9px 4px`, radius 12px. The selected tab is `--ink`, weight 700.
- **Sliding pill** behind the active tab: absolute, `top: 6px`, `height: calc(100% - 14px)`, radius 12px, `--soft` fill. Animate `transform` and `width` over `.32s cubic-bezier(.3,.7,.2,1)`. Measure the active button's `offsetLeft` and `offsetWidth`, and re-measure on resize.
- Round icon button ("dot"): 38×38, circle, `1px solid var(--rule)`, `--bg` background, `box-shadow: 0 3px 10px rgba(0,0,0,.08)`, 14px, weight 700, 18px icon. Pressed state: `--ink` background, `--bg` text.
- Segmented switch: 38px tall pill, 3px padding, same border and shadow. Each segment is 30px tall, padding `0 12px`, 13px, weight 700, `--muted`. The pressed segment is filled `--ink` with `--bg` text.

## 5. Left tool notch

- Fixed, vertically centred (`top: 50%; translateY(-50%)`), glued to the left edge. Width 42px; column layout, gap 3px, padding `6px 5px`. No left border; radius `0 16px 16px 0`; `box-shadow: 4px 0 16px rgba(0,0,0,.08)`.
- When the table of contents opens, it slides right to sit next to it: animate `left` from 0 to 280px over .25s ease.
- Buttons are 31×31, radius 8px, `1.5px solid transparent` border. Pressed: border `currentColor` plus `--soft` fill. Disabled: opacity .3.
- Order from top:
  1. TOC toggle, as a `›`/`‹` glyph at 22px, weight 600
  2. Five colour swatches, each a 13×20 chip with radius 4px
  3. A separator (22×1px, `--rule`, margin `3px 0`)
  4. Pen (only on pdf mode)
  5. Eraser
  6. "Aa" option for font
- Icons are 24-unit line icons, 18px, stroke 1.9, round caps and joins (Lucide-style). Match the demo's SVGs.
- Tools only work on the Lesson tab. The pen is disabled outside PDF mode, with a tooltip saying so.
- With a swatch active, clicking the same swatch turns the marker off. With the pen active, a swatch changes the pen colour.

## 6. Table of contents

- Fixed full-height drawer on the left, 280px wide, `--bg`, `border-right: 1px solid var(--rule)`, padding `22px 12px 22px 14px`, scrollable. Closed state is `translateX(-100%)`; it slides in over .25s ease.
- Header: 12px, uppercase, letter-spacing .12em, `--muted`, margin `0 0 12px 6px`.
- Entries are full-width left-aligned buttons: radius 8px, padding `6px 8px`, 14.5px, line-height 1.3, weight 600. The active entry has a `--soft` fill and weight 800.
- Scroll-spy highlights the current heading. Clicking an entry jumps there and, in PDF mode, flashes the heading (see section 12). On screens narrower than 720px the drawer closes after a jump.

## 7. Right edge: AI button and Chat AI | Notebook panel

- **Edge button**: fixed, right edge, vertically centred, 42px wide, padding `14px 0`. No right border; radius `16px 0 0 16px`. Filled `--ink` with `--bg` icon (a 20px sparkle) and `box-shadow: -4px 0 16px rgba(0,0,0,.12)`. When the panel is open, it moves left to sit on the panel's edge (`right: min(var(--chatw), 100vw)`), animating over .25s.
- **Panel**: fixed full height on the right, `width: min(var(--chatw), 100vw)`, `--bg`, `border-left: 1px solid var(--rule)`, flex column. Closed state is `translateX(100%)`; it slides in over .25s.
- **Resize grip**: a 10px strip at the panel's left edge (`left: -5px`) with an `ew-resize` cursor and `touch-action: none`. Dragging sets `--chatw` between 300px and 70% of the viewport. Disable transitions while dragging.
- **Panel tabs**: a smaller copy of the top notch at the top of the panel. `width: min(250px, 100%)`, radius `0 0 20px 20px`, padding `6px 12px 8px`, with the same sliding pill. Tabs are **Notebook** and **Chat AI**.
- **Chat AI panel**:
  - Message log: padding 18px, gap 12px, 15px text.
  - Bubbles: padding `10px 13px`, radius 14px, max-width 92%. User bubbles are right-aligned with `--ink` fill and `--bg` text. AI bubbles use `--soft` fill.
  - Provenance label inside AI bubbles: block, 13px, `--muted`, margin-top 6px.
  - Composer: padding `12px 18px 18px` with a top rule. Input is 15px, padding `9px 12px`, radius 10px, rule border. Send button is `--ink`, radius 10px, padding `0 14px`, weight 700.
- **Notebook**:
  - Navigation bar (padding `16px 18px 6px`): ‹ and › buttons (30px, radius 8, 20px glyph), a centred counter "Note 3 din 7" (14px, weight 800), and a trash icon.
  - Meta line: padding `0 18px`, 13px, weight 600, `--muted`, with the bold part in `--ink`. Format: "**Ortopedie I · Tip și localizare** · p. 586 · 25 oct., 14:02".
  - **Lined-paper textarea**: borderless, transparent, 16px, line-height 1.65, margin `10px 18px 80px`. The lines are drawn with `background-image: linear-gradient(transparent calc(1.65em - 1px), var(--rule) calc(1.65em - 1px)); background-size: 100% 1.65em; background-attachment: local;`.
  - **+ button**: dot-style, absolute at bottom-left (18px, 18px), 22px glyph.

## 8. Lesson tab: PDF mode (book pages)

Each page is a `div` with `aspect-ratio: <pageWidth> / <pageHeight>` (in PDF points), full column width, white background, margin-bottom 16px, `box-shadow: 0 1px 3px rgba(0,0,0,.16), 0 6px 18px rgba(0,0,0,.07)`, and `user-select: none` (including `-webkit-touch-callout: none`).

Stack these layers in this order, all `position: absolute; inset: 0`:

1. `img`: the page image, `pointer-events: none`, not draggable.
2. **Highlights layer**: one rectangle per run of adjacent same-colour words on the same line. Position in **percentages of page size**. The rectangle spans the words' x-range plus 0.8pt padding, starts 15% down the word box and is 70% of its height. Use radius 1px and `mix-blend-mode: multiply`, with fill from `--h0`…`--h4`.
3. **Quiz-source layer** (orange, see tokens) and **notes layer**. Notes show a dashed underline under anchored words. A 22px round note bubble sits at the end of the last word (`transform: translate(3px,-55%)`, `box-shadow: 0 2px 6px rgba(0,0,0,.25)`, 13px icon) and opens the note.
4. **Ink layer**: an `svg` whose `viewBox` is the page size in points, with `preserveAspectRatio="none"` and `overflow: visible`. Strokes are paths with no fill and round caps and joins, so they scale with the page for free.

When a tool is active, the cursor over pages is `crosshair`.

## 9. Lecție tab: Text mode

- The same lesson, rendered from the structured HTML instead of page images. Each section has a top rule (`border-top: 1px solid var(--rule); margin-top: 20px`) .
- Every word is wrapped in its own `span` with a global index, so marking is word-level. Highlighted words get the `--h*` fill with radius 2px. Note-anchored words get a 2px dashed `--accent` underline. The note bubble renders inline (`position: relative; display: inline-flex; vertical-align: middle; translateY(-2px); margin: 0 2px`).
- When a tool is active, text is non-selectable and the cursor is `text`.

## 10. Annotation feel (Lesson)

Keep or build these behaviours. They are part of how the design feels:

- **Drag to mark.** On PDF pages, interpolate between pointer events every 2 page units so fast drags don't skip words. In Text mode, everything between the start word and the current word gets marked.
- **Pen.** Strokes are smoothed with quadratic Bézier curves through point midpoints, sampled with `getCoalescedEvents()`. Stroke width is about 1.3pt for mouse and touch, and `1 + pressure × 0.7` for a stylus.
- **Pen vs. finger.** Until the first `pointerType === 'pen'` event, a finger draws (with `touch-action: none` on pages). After a pen has been seen, fingers only scroll and only the pen draws.
- **Eraser** removes highlights and any stroke passing within about 4 units.
- **Undo**: up to 80 steps; gestures that changed nothing aren't recorded. A quick two-finger tap (under 380ms, under 10px of movement) also undoes.
- **Keyboard (Lesson only, ignored while typing)**:
  - `1`–`5` pick a marker colour
  - `E` toggles the marker
  - `R` eraser
  - `P` pen (PDF mode only)
  - `W` note
  - `Q` explain
  - `Z` and Ctrl/Cmd+Z undo
  - `Esc` clears the active tool
- **Note tool.** Dragging over a passage opens the right panel on the Notebook tab, creates a note quoting the passage and focuses the textarea. An empty note with no anchor deletes itself when the user leaves it.

## 11. Review tab (cloze reading)

- The lesson text with key phrases turned into in-place gaps. Each gap shows a **type hint**, not a length: "[ procent ]", "[ mecanism ]", "[ eponim ]", "[ complicație ]".
- **Cloze span**: inline, radius 5px, padding `0 3px`, `--cloze-bg` fill, `--cloze` text, weight 700, pointer cursor.
- **Hidden gap**: the answer's text colour becomes transparent and keeps its width. Add a `border-bottom: 2px solid var(--cloze)` and `white-space: nowrap`. A `::before` shows `attr(data-hint)` in `--cloze` at weight 600, .88em. With hints off, show "[ … ]" instead.
- The current gap gets `outline: 2px solid var(--cloze); outline-offset: 2px`.
- Graded gaps are tinted: `color-mix(in srgb, var(--again) 18%, transparent)` with `--again` text, and the same for Hard (18%) and Good (16%).
- **Bottom bar** (Focus only): a notch glued to the bottom edge, centred, `max-width: calc(100vw - 16px)`. Padding is `10px 12px` plus the bottom safe area. No bottom border; radius `22px 22px 0 0`; `box-shadow: 0 -6px 22px rgba(0,0,0,.08)`.
  - Before revealing: one wide **Arată** button (`min-width: 252px`, `--ink` border) with a "Spațiu" hint.
  - After revealing: **Again / Hard / Good** buttons. Each is a column with min-width 76px, padding `8px 10px`, radius 12px, a 1.5px border in the grade colour, `--paper` background and `#1d1f23` text at 15px, weight 800. The interval label below is 12px, weight 600, `#6c6f76`. Show the real next interval from the scheduler, not the demo's fixed labels.
  - Left side: 36px dots for **Cartonașe** (cards view) and **Doar ce ai ratat** (only missed).
  - Right side: 36px dots for **Ascunde indiciile** (hide hints) and **Câte un gol o dată** (one gap at a time; the rest shows filled in).
  - Keys: `Space` reveals; `1`/`2`/`3` grade.
- **Cards overlay**: fixed, full screen, background `color-mix(in srgb, var(--bg) 92%, transparent)`, content centred, padding `80px 60px 140px`.
  - Card: `min(560px, 100%)`, `--paper` background, radius 18px, `box-shadow: 0 20px 50px rgba(0,0,0,.15)`, padding `30px 30px 24px`, 19px, line-height 1.5.
  - Meta row: 12px, uppercase, letter-spacing .1em, `#6c6f76`, weight 700, space-between, showing the section name and "3 / 50".
  - The card shows only the sentence or list item containing the current gap.
  - Clicking the backdrop closes the overlay.
- Cards and grade buttons **stay on light paper in dark mode** (`--paper` is light in both themes).

## 12. Grile tab (quizzes) and the quiz-to-lesson link

- **Header**: flex, space-between, wrapping, padding `30px 0 4px`. The title is 22px, weight 800, and reads "Grile · \<section\>" or "Toate grilele".
- **Question block**: top rule, padding `20px 0`.
- **Options**: full-width buttons, flex, gap 12px, padding `10px 0`, bottom rule. The letter is a 28px circle with a `1.5px solid var(--rule)` border, 13px, weight 800.
  - Picked: `--ink` fill, `--bg` text.
  - Correct: `--good` fill, white text.
  - Wrong pick: `--again` fill, white text.
  - After checking, each option shows "Adevărat. …" or "Fals. …" at 14.5px, `--muted`, indented 40px.
- **Action row**: margin-top 12px, gap 12px.
  - **Verifică** button: `--ink` fill, radius 10px, padding `9px 16px`, weight 700.
  - Score text.
  - "↗ See in lesson": a text link in `--accent`, 14px, weight 700, shown after checking.
  - Source label: right-aligned, 13px, `--muted`, weight 700.
- **"See in lesson"** switches to Lecție and paints each option's source sentence in the quiz-source orange, in whichever mode is active. It scrolls so the first sentence sits one third down the viewport.
- **Back bar**: a pill fixed at `top: 72px`, centred, `--ink` fill, `--bg` text, padding `8px 16px`, 14px, weight 700, `--shadow`, reading "← Înapoi la grile". It returns to the exact quiz the user left from and only appears after "Vezi în lecție".
- **Heading flash**: when jumping to a heading in PDF mode, overlay a `rgba(255,200,0,.5)` rectangle (radius 3px) over the heading words. It stays fully opaque until 40% of a 1.6s animation, then fades out.

## 13. Feedback, theme, motion and responsiveness

- **Toast**: fixed at `top: 76px`, centred, `--ink` fill, `--bg` text, radius 999px, padding `8px 14px`, 14px, weight 600, `max-width: calc(100vw - 32px)`. Fade to opacity .95 over .2s, and hide after 1.8s.
- **Dark mode** follows `prefers-color-scheme` by default. The moon button forces a theme with `data-theme="dark|light"` on `<html>`. Both the media query (guarded by `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]` must apply the dark tokens. Book pages are not recoloured; invert them with `filter: invert(.9) hue-rotate(180deg)`. Persist the user's choice.
- **Motion**:
  - Tab pills: .32s on the curve above.
  - Drawers, panel and edge buttons: .25s ease.
  - Toast: .2s.
  - With `prefers-reduced-motion: reduce`, turn off all of these transitions.
- **Narrow screens (≤720px)**:
  - Increase body side padding to 50px so the edge notches never cover text.
  - Tighten the Focus bar: gap 6px, inline padding 8px; grade buttons min-width 56px, padding `7px 6px`, 14px; Arată min-width 190px; side dots 32px.
  - Change the cards overlay padding to `80px 50px 140px`.
- **Swipe between tabs** on touch: a horizontal swipe over 90px, under 700ms, with vertical movement under 45% of horizontal. Disable it while a Lecție tool is active, inside drawers, panels, the bar or the cards overlay, and when the page is pinch-zoomed.
- **Accessibility**: every icon button has an `aria-label`. Tabs use `aria-selected`; toggles use `aria-pressed`. Focus rings are `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`. Keep keyboard shortcuts inactive while an input or textarea has focus.

## 14. Expo (mobile) notes

- Consume the shared tokens (colours, radii, type scale, shadows translated to RN `shadow*`/`elevation`).
- For ink on mobile, follow the existing annotation implementation. The visual targets (stroke smoothing, colours, pen-vs-finger rule) are the same as on web.
- List anything that can't be matched closely (e.g. `mix-blend-mode`, `color-mix`) and the fallback you chose.

## 15. Working order and verification

1. **Tokens and font**: tokens package, CSS variables, Tailwind mapping, Figtree, light and dark.
2. **Shell**: page padding, top notch with pill, side dots, toast.
3. **Lecție**: tool notch, TOC drawer, PDF page layers, Text mode, annotation visuals.
4. **Right panel**: edge button, resizable panel, Chat AI styling, Carnet.
5. **Focus**: cloze styling, bottom bar, cards overlay.
6. **Grile**: list styling, "Vezi în lecție", back bar, heading flash.
7. **Responsive, dark mode, reduced motion, accessibility pass.**
8. **Expo** token adoption and layout parity.

After each phase:

- Run the type checker, linter and existing tests. All must stay green; fix anything you break.
- Use Playwright to take screenshots of the app and of `docs/design/demo-reference.html` at **1440px, 1024px and 390px** widths, in **light and dark**. Compare them side by side. Note and fix visible differences in spacing, sizes, colours and radii before moving on.

When done, write `docs/design/implementation-notes.md` covering:

- What was changed
- Any deliberate deviations from the demo and why
- Expo gaps
- Follow-ups (e.g. a real spaced-repetition scheduler, if one isn't wired up yet)
