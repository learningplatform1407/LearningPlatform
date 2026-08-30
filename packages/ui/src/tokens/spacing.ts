// 4px base unit.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
} as const satisfies Record<string, number>;

export type SpacingToken = keyof typeof spacing;
