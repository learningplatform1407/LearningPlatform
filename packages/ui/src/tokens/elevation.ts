// React Native has no equivalent of Tailwind's built-in shadow/radius
// utilities, so these are explicit numeric tokens for mobile. Web keeps
// using Tailwind's own shadow-sm/shadow-md/rounded-md utility classes
// directly rather than duplicating a parallel scale here.
export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  full: 9999,
} as const satisfies Record<string, number>;

export type RadiusToken = keyof typeof radii;

export const shadows = {
  sm: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export type ShadowToken = keyof typeof shadows;
