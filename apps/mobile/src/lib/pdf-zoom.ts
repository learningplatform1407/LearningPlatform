/**
 * Pinch-to-zoom geometry for the lecture PDF's pages.
 *
 * Kept pure and separate from the view because of what the view may not do:
 * **the native `<Pdf>` must never be resized.** AndroidPdfViewer renders
 * bitmaps on its own thread and recycles the document when a view detaches,
 * without cancelling the jobs queued against it, so resizing every mounted
 * page at once reliably crashes it ("Get page pdf document null" — see
 * docs/architecture/lecture-pdf-ink.md §6.2.1).
 *
 * So zoom is two sizes, not one:
 *
 * - `base*`, the fit-width size every `<Pdf>` is rendered at, for the life
 *   of the screen. It changes only when the column's own width does.
 * - the laid-out size, which grows with `zoom`. The page image is
 *   transform-scaled to fill it, which costs sharpness; the overlays (ink,
 *   highlights) are laid out at the zoomed size instead, so they stay crisp
 *   and keep sitting exactly where they sat.
 *
 * Everything stored stays in page units — a fraction of the page, margins
 * included — so nothing about zoom reaches the server, and a mark made at
 * 3× is in the same place at 1×.
 */

/**
 * How much of a page's width each writing margin takes. Mirrors the web's
 * MARGIN_FRACTION, and so does the storage: ink in a margin keeps
 * page-normalised coordinates, just outside [0, 1], so a note written beside
 * the text on one platform lands in the same place on the other.
 */
export const MARGIN_FRACTION = 0.18;

/** Fit-width. Below this a page would be smaller than the column. */
export const MIN_ZOOM = 1;
/**
 * Three times fit-width. The page image is a bitmap rendered at the base
 * size, so zooming past this is mostly magnifying its pixels; the number is
 * a judgement about where that stops being worth it, not a limit of the
 * maths.
 */
export const MAX_ZOOM = 3;

export function clampZoom(zoom: number): number {
  // NaN only: it means "no idea", so fit-width is the safe reset. The
  // infinities are a direction rather than nonsense -- spreading the fingers
  // infinitely far means zoom in -- and Math.min/max land them on the bounds
  // by themselves.
  if (Number.isNaN(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The scale a pinch has reached, from how far apart the two fingers were
 * when it started and how far apart they are now. Returns 1 for a
 * degenerate start — both fingers on the same point — which would otherwise
 * divide by zero.
 */
export function pinchScale(startDistance: number, currentDistance: number): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) return 1;
  return currentDistance / startDistance;
}

/** The distance between the first two touches of a gesture, or null when
 * fewer than two are down — which is what tells a pinch from a drag. */
export function touchDistance(touches: readonly { pageX: number; pageY: number }[]): number | null {
  const [a, b] = touches;
  if (!a || !b) return null;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export interface PageBox {
  /** What the `<Pdf>` is rendered at, and never re-rendered at. */
  baseWidth: number;
  baseHeight: number;
  /** One margin at the base size: the page image's own scale. */
  baseMarginWidth: number;
  /** The laid-out size at this zoom, which the overlays use. */
  width: number;
  height: number;
  marginWidth: number;
  /** The page and both its margins: the row's width, and what has to be
   * scrolled sideways once it is wider than the column. */
  rowWidth: number;
  /** What the page image is transform-scaled by to fill its box. */
  scale: number;
}

/**
 * The page's size at this zoom, from the column's width.
 *
 * The margins are rounded to whole points **first** and the page takes the
 * remainder, so page + margins is exactly the column at 1× — rounding the
 * page instead left it a fraction of a point too wide, which is a scrollbar
 * on every lesson. The same rule as the web reader's `pageLayout`.
 */
export function pageBox(columnWidth: number, aspect: number, zoom: number): PageBox {
  const safeZoom = clampZoom(zoom);
  const across = Math.max(0, columnWidth);
  const baseMarginWidth = Math.round((across * MARGIN_FRACTION) / (1 + 2 * MARGIN_FRACTION));
  const baseWidth = Math.max(0, across - 2 * baseMarginWidth);
  const baseHeight = baseWidth * aspect;
  return {
    baseWidth,
    baseHeight,
    baseMarginWidth,
    width: baseWidth * safeZoom,
    height: baseHeight * safeZoom,
    marginWidth: baseMarginWidth * safeZoom,
    rowWidth: (baseWidth + 2 * baseMarginWidth) * safeZoom,
    scale: safeZoom,
  };
}
