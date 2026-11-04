// One family everywhere. Web loads it with next/font (CSS variable
// `--font-figtree`); mobile with @expo-google-fonts/figtree, where each
// weight is its own family name -- see `figtreeFamily` below.
export const fontFamily = "Figtree";

// The design's sizes. The original keys (xs, sm, base, lg, xl, 2xl, 3xl,
// 4xl) keep their values so existing call sites don't shift; the named
// steps between them are new.
export const fontSizes = {
  xs: 12, // kickers, TOC headers, meta rows
  caption: 13, // notebook meta, segmented switch, provenance labels
  sm: 14,
  toc: 14.5, // TOC entries, quiz rationales
  ui: 15, // tabs, chat, grade buttons
  base: 16,
  body: 17, // lesson and body text
  lg: 18,
  card: 19, // cloze cards
  xl: 20,
  heading: 22, // section headings
  "2xl": 24,
  "3xl": 30,
  title: 34, // lesson title, upper bound of clamp(26px, 4vw, 34px)
  "4xl": 36,
} as const satisfies Record<string, number>;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const satisfies Record<string, string>;

/** @expo-google-fonts/figtree registers one family per weight. */
export const figtreeFamily = {
  "400": "Figtree_400Regular",
  "500": "Figtree_500Medium",
  "600": "Figtree_600SemiBold",
  "700": "Figtree_700Bold",
  "800": "Figtree_800ExtraBold",
} as const satisfies Record<(typeof fontWeights)[keyof typeof fontWeights], string>;

// Unitless ratios, matching CSS's native unitless `line-height` behavior
// directly (web can use these values as-is). React Native's `lineHeight`
// style prop is an absolute pixel number, not a ratio — RN consumers must
// compute `fontSize * lineHeights.normal` themselves at usage time.
export const lineHeights = {
  tight: 1.15, // titles
  snug: 1.25, // section headings
  normal: 1.5,
  reading: 1.6, // body and lesson text
  relaxed: 1.75,
} as const satisfies Record<string, number>;

export type FontSizeToken = keyof typeof fontSizes;
export type FontWeightToken = keyof typeof fontWeights;
export type LineHeightToken = keyof typeof lineHeights;
