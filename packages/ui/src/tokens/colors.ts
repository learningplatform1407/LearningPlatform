// The "quiet book" palette (docs/design/design.md §1): warm off-white page,
// graphite ink, one blue accent. Semantic names, so a theme swaps values
// without anything downstream renaming a class or a style key.
//
// `primary` is ink, not blue: filled buttons in the design are graphite.
// Links, notes and other "go here" affordances use `accent`.
//
// `paper` and `paperForeground` deliberately stay light in both themes --
// cloze cards and grade buttons read as paper on a dark desk.
export const lightColors = {
  background: "#F7F6F2",
  foreground: "#1D1F23",

  // A translucent fill, not a solid grey: hover/pressed states, the sliding
  // tab pill and chat bubbles all sit on top of whatever is behind them.
  muted: "rgba(110, 110, 120, 0.13)",
  mutedForeground: "#6C6F76",

  border: "#DEDBD2",

  primary: "#1D1F23",
  primaryForeground: "#F7F6F2",

  secondary: "rgba(110, 110, 120, 0.13)",
  secondaryForeground: "#1D1F23",

  accent: "#2D6B9A",
  accentForeground: "#FFFFFF",

  paper: "#FFFFFF",
  paperForeground: "#1D1F23",
  paperMutedForeground: "#6C6F76",

  danger: "#C8372D",
  dangerForeground: "#FFFFFF",
  success: "#267140",
  warning: "#C27A10",

  // Review grades. Again/Hard/Good are the design's; Easy is ours (the SM-2
  // scheduler has four ratings) and takes the accent so it reads as "fine".
  again: "#C8372D",
  hard: "#C27A10",
  good: "#267140",
  easy: "#2D6B9A",
  // Precomputed instead of `color-mix()`, which React Native can't do.
  againTint: "rgba(200, 55, 45, 0.18)",
  hardTint: "rgba(194, 122, 16, 0.18)",
  goodTint: "rgba(47, 138, 79, 0.16)",
  easyTint: "rgba(47, 111, 159, 0.16)",

  cloze: "#2D6B9A",
  clozeBg: "rgba(47, 111, 159, 0.10)",

  // Highlighter fills, in swatch order: yellow, blue, purple, red, green.
  highlight0: "rgba(255, 212, 0, 0.45)",
  highlight1: "rgba(80, 170, 255, 0.35)",
  highlight2: "rgba(170, 110, 255, 0.33)",
  highlight3: "rgba(255, 90, 90, 0.33)",
  highlight4: "rgba(80, 200, 110, 0.35)",

  // The page showing through an overlay (cards view, modals).
  scrim: "rgba(247, 246, 242, 0.92)",
} as const satisfies Record<string, string>;

export type ColorToken = keyof typeof lightColors;

export const darkColors = {
  background: "#17181B",
  foreground: "#E9E8E4",

  muted: "rgba(200, 200, 210, 0.13)",
  mutedForeground: "#A2A39F",

  border: "#34363B",

  primary: "#E9E8E4",
  primaryForeground: "#17181B",

  secondary: "rgba(200, 200, 210, 0.13)",
  secondaryForeground: "#E9E8E4",

  accent: "#7DB3DB",
  accentForeground: "#17181B",

  paper: "#F4F2EC",
  paperForeground: "#1D1F23",
  paperMutedForeground: "#5F6269",

  danger: "#E0574C",
  dangerForeground: "#17181B",
  success: "#5CBF7D",
  warning: "#E0A03A",

  again: "#E0574C",
  hard: "#E0A03A",
  good: "#5CBF7D",
  easy: "#7DB3DB",
  againTint: "rgba(224, 87, 76, 0.18)",
  hardTint: "rgba(224, 160, 58, 0.18)",
  goodTint: "rgba(92, 191, 125, 0.16)",
  easyTint: "rgba(125, 179, 219, 0.16)",

  cloze: "#86BFE6",
  clozeBg: "rgba(134, 191, 230, 0.14)",

  highlight0: "rgba(255, 212, 0, 0.32)",
  highlight1: "rgba(80, 170, 255, 0.32)",
  highlight2: "rgba(170, 110, 255, 0.34)",
  highlight3: "rgba(255, 90, 90, 0.32)",
  highlight4: "rgba(80, 200, 110, 0.30)",

  scrim: "rgba(23, 24, 27, 0.92)",
} as const satisfies Record<ColorToken, string>;

/** The light palette. Existing consumers import `colors`; theme-aware code
 * picks between `lightColors` and `darkColors` instead. */
export const colors = lightColors;

/** Colours that sit on the lesson page itself and are not themed. A PDF
 * page is inverted wholesale in dark mode, and its marks with it. */
export const pageColors = {
  // Toolbar swatch chips, same order as highlight0..4.
  swatches: ["#F5C400", "#4EA8FF", "#9B6BFF", "#F05A5A", "#3CB46E"],
  // Pen ink, same order.
  pens: ["#D9A400", "#1E7FE0", "#7D4FE0", "#D93636", "#2F9E55"],
  quizSourceFill: "rgba(255, 140, 0, 0.22)",
  quizSourceFillText: "rgba(255, 140, 0, 0.24)",
  quizSourceLine: "#FF7A00",
  noteUnderline: "#2F6F9F",
  noteSelection: "rgba(47, 111, 159, 0.16)",
  noteBubble: "#2F6F9F",
  noteBubbleIcon: "#FFFFFF",
  headingFlash: "rgba(255, 200, 0, 0.5)",
  page: "#FFFFFF",
} as const;

/** Stored highlight colour names, in swatch order. `pink` is the legacy
 * fourth colour from before the redesign; it renders with the red fill. */
export const HIGHLIGHT_COLOR_NAMES = ["yellow", "blue", "purple", "red", "green"] as const;
export type HighlightColorName = (typeof HIGHLIGHT_COLOR_NAMES)[number];

export function highlightIndex(name: string | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (name === "pink") return 3;
  const index = HIGHLIGHT_COLOR_NAMES.indexOf(name as HighlightColorName);
  return (index < 0 ? 0 : index) as 0 | 1 | 2 | 3 | 4;
}
