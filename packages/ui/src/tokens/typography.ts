export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const satisfies Record<string, number>;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const satisfies Record<string, string>;

// Unitless ratios, matching CSS's native unitless `line-height` behavior
// directly (web can use these values as-is). React Native's `lineHeight`
// style prop is an absolute pixel number, not a ratio — RN consumers must
// compute `fontSize * lineHeights.normal` themselves at usage time.
export const lineHeights = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const satisfies Record<string, number>;

export type FontSizeToken = keyof typeof fontSizes;
export type FontWeightToken = keyof typeof fontWeights;
export type LineHeightToken = keyof typeof lineHeights;
