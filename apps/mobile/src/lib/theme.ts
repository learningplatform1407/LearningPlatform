import { lineHeights } from "@lp/ui";

export { colors, fontSizes, fontWeights, radii, shadows, spacing } from "@lp/ui";
export type {
  ColorToken,
  FontSizeToken,
  FontWeightToken,
  RadiusToken,
  ShadowToken,
  SpacingToken,
} from "@lp/ui";

/**
 * React Native's `lineHeight` style prop is an absolute pixel value, unlike
 * CSS's unitless ratio (see packages/ui/src/tokens/typography.ts). This
 * centralizes the conversion so screens call `lineHeight(fontSizes.base)`
 * instead of re-deriving `fontSize * ratio` themselves.
 */
export function lineHeight(fontSize: number, ratio: keyof typeof lineHeights = "normal"): number {
  return Math.round(fontSize * lineHeights[ratio]);
}
