// Radii from the design: buttons 10, tab pills 12, side notches 16, cards
// 18, the top/bottom notches 22. Web maps these onto Tailwind's rounded-*
// scale in globals.css, so `rounded-md` is a button and `rounded-notch` a
// notch on both platforms.
export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  sheet: 18,
  notch: 22,
  full: 9999,
} as const satisfies Record<string, number>;

export type RadiusToken = keyof typeof radii;

// React Native shadow shapes. Web uses the CSS strings in globals.css
// (`shadow-notch`, `shadow-dot`, ...) -- same names, same intent.
export const shadows = {
  sm: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  /** Top/bottom notches and floating pills: 0 8px 22px rgba(0,0,0,.08). */
  notch: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 11,
    elevation: 6,
  },
  /** Round "dot" buttons: 0 3px 10px rgba(0,0,0,.08). */
  dot: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  /** Cards lifted off the page: 0 20px 50px rgba(0,0,0,.15). */
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 12,
  },
} as const;

export type ShadowToken = keyof typeof shadows;

/** Motion, shared so both platforms feel the same. */
export const motion = {
  /** Sliding tab pill. */
  pillMs: 320,
  pillEasing: [0.3, 0.7, 0.2, 1] as const,
  /** Drawers, side panel, edge buttons. */
  drawerMs: 250,
  toastMs: 200,
  toastHoldMs: 1800,
} as const;
