// Light palette only for now. Semantic names (not raw color names) so a
// dark palette can be added later without renaming anything downstream.
export const colors = {
  background: "#FFFFFF",
  foreground: "#0F172A",

  muted: "#F1F5F9",
  mutedForeground: "#64748B",

  border: "#E2E8F0",

  primary: "#2563EB",
  primaryForeground: "#FFFFFF",

  secondary: "#F1F5F9",
  secondaryForeground: "#0F172A",

  danger: "#DC2626",
  dangerForeground: "#FFFFFF",

  success: "#16A34A",
  warning: "#D97706",
} as const satisfies Record<string, string>;

export type ColorToken = keyof typeof colors;
