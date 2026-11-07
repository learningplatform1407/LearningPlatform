// A deep, "leather-bound" palette rather than the app's bright UI colours,
// picked deterministically from the title so the same book always gets the
// same cover on every device, with no cover-image field to render instead.
export const BOOK_COVER_COLORS = [
  "#1e3a8a", // indigo
  "#7f1d1d", // maroon
  "#14532d", // forest green
  "#581c87", // purple
  "#854d0e", // mustard
  "#164e63", // deep cyan
  "#7c2d12", // rust
  "#0f766e", // teal
] as const;

export function coverColorForTitle(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return BOOK_COVER_COLORS[Math.abs(hash) % BOOK_COVER_COLORS.length]!;
}
