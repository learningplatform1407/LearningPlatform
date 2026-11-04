import type { PageHighlight, Stroke, StrokePoint } from "@lp/contracts";

import { findQuote } from "@/lib/text-offset";

/** A word's box on a page, in page units ([0, 1] of width and height),
 * with its position in reading order. */
export interface PageWord {
  index: number;
  /** The word as pdf.js read it -- used to find quoted passages. */
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The subset of a pdf.js text item this module reads. */
export interface TextItemLike {
  str: string;
  /** Already multiplied into viewport space: [a, b, c, d, e, f]. */
  transform: number[];
  /** Advance width, in viewport units. */
  width: number;
}

/**
 * Splits pdf.js text items into word boxes. pdf.js gives runs of text, not
 * words, so each run's width is shared out across its characters --
 * proportional spacing makes this approximate, but marking snaps to whole
 * words, so a box a little wide or narrow still selects the right word.
 *
 * `items` must already be in viewport coordinates (transform multiplied by
 * the viewport's), and `pageWidth`/`pageHeight` that viewport's size.
 */
export function wordsFromTextItems(
  items: TextItemLike[],
  pageWidth: number,
  pageHeight: number,
): PageWord[] {
  const words: PageWord[] = [];
  for (const item of items) {
    if (!item.str.trim() || item.width <= 0) continue;
    const [, , c = 0, d = 0, e = 0, f = 0] = item.transform;
    const fontHeight = Math.hypot(c, d);
    if (fontHeight <= 0) continue;
    const charWidth = item.width / item.str.length;
    for (const match of item.str.matchAll(/\S+/g)) {
      const x0 = e + match.index * charWidth;
      const x1 = x0 + match[0].length * charWidth;
      words.push({
        index: words.length,
        text: match[0],
        x0: x0 / pageWidth,
        // `f` is the baseline; the box reaches one font-height above it.
        y0: (f - fontHeight) / pageHeight,
        x1: x1 / pageWidth,
        y1: f / pageHeight,
      });
    }
  }
  return words;
}

/**
 * The first and last word of a quoted passage on this page, in reading
 * order, or null when the page doesn't contain it. Words are joined with
 * single spaces and matched with findQuote's loose whitespace, so a
 * passage that wraps across lines (or runs) on the page still matches.
 */
export function wordsForQuote(words: PageWord[], quote: string): [number, number] | null {
  let text = "";
  const starts: number[] = [];
  for (const word of words) {
    if (text) text += " ";
    starts.push(text.length);
    text += word.text;
  }
  const found = findQuote(text, quote);
  if (!found) return null;
  let first = -1;
  let last = -1;
  words.forEach((word, i) => {
    const start = starts[i]!;
    const end = start + word.text.length;
    if (end > found.start && start < found.end) {
      if (first < 0) first = word.index;
      last = word.index;
    }
  });
  return first < 0 ? null : [first, last];
}

/** The word under a point, or the nearest one within `reach` page units. */
export function wordAt(words: PageWord[], x: number, y: number, reach = 0.02): PageWord | null {
  let best: PageWord | null = null;
  let bestDistance = reach;
  for (const word of words) {
    const dx = x < word.x0 ? word.x0 - x : x > word.x1 ? x - word.x1 : 0;
    const dy = y < word.y0 ? word.y0 - y : y > word.y1 ? y - word.y1 : 0;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return word;
    if (distance < bestDistance) {
      best = word;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Highlight rectangles for the words from `a` to `b` in reading order: one
 * per run of words on the same line (design.md §8), spanning the run plus a
 * little padding, from 15% down the word box for 70% of its height.
 */
export function rectsForRange(
  words: PageWord[],
  a: number,
  b: number,
  padX = 0.0015,
): PageHighlight["rects"] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const rects: PageHighlight["rects"] = [];
  let line: PageWord[] = [];

  function flush() {
    if (line.length === 0) return;
    const x0 = Math.min(...line.map((w) => w.x0));
    const x1 = Math.max(...line.map((w) => w.x1));
    const top = Math.min(...line.map((w) => w.y0));
    const bottom = Math.max(...line.map((w) => w.y1));
    const height = bottom - top;
    rects.push([
      clamp(x0 - padX),
      clamp(top + height * 0.15),
      clamp(x1 + padX),
      clamp(top + height * 0.85),
    ]);
    line = [];
  }

  for (const word of words.slice(from, to + 1)) {
    const previous = line[line.length - 1];
    // A new line when the word starts left of the last one or sits clearly
    // lower -- reading order wraps there.
    if (
      previous &&
      (word.x0 < previous.x0 || word.y0 > previous.y1 - (previous.y1 - previous.y0) * 0.3)
    ) {
      flush();
    }
    line.push(word);
  }
  flush();
  return rects;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Whether a point falls inside any of a highlight's rectangles. */
export function highlightHit(highlight: PageHighlight, x: number, y: number, pad = 0.004): boolean {
  return highlight.rects.some(
    ([x0, y0, x1, y1]) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad,
  );
}

/** Whether a stroke passes within `radius` page units of a point (the
 * eraser removes whole strokes, as in the design). Distances are measured
 * in an aspect-corrected space so the reach is round on a tall page. */
export function strokeHit(
  stroke: Stroke,
  x: number,
  y: number,
  radius: number,
  aspect: number,
): boolean {
  const points = stroke.points;
  const within = (p: StrokePoint, q?: StrokePoint) => {
    if (!q) return Math.hypot(p.x - x, (p.y - y) * aspect) <= radius;
    // Distance from the point to the segment p-q.
    const ax = p.x;
    const ay = p.y * aspect;
    const bx = q.x;
    const by = q.y * aspect;
    const px = x;
    const py = y * aspect;
    const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSquared));
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) <= radius;
  };
  if (points.length === 1) return within(points[0]!);
  for (let i = 0; i < points.length - 1; i += 1) {
    if (within(points[i]!, points[i + 1])) return true;
  }
  return false;
}

/** A smooth SVG path through a stroke's points: quadratic Bézier curves
 * through the midpoints (design.md §10), in page units scaled by `w`/`h`. */
export function strokePath(points: StrokePoint[], w = 1, h = 1): string {
  if (points.length === 0) return "";
  const p = points.map((point) => [point.x * w, point.y * h] as const);
  if (p.length === 1) return `M${p[0]![0]} ${p[0]![1]}l0.01 0`;
  if (p.length === 2) return `M${p[0]![0]} ${p[0]![1]}L${p[1]![0]} ${p[1]![1]}`;
  let d = `M${p[0]![0]} ${p[0]![1]}`;
  for (let i = 1; i < p.length - 1; i += 1) {
    const midX = (p[i]![0] + p[i + 1]![0]) / 2;
    const midY = (p[i]![1] + p[i + 1]![1]) / 2;
    d += `Q${p[i]![0]} ${p[i]![1]} ${midX} ${midY}`;
  }
  const last = p[p.length - 1]!;
  return `${d}L${last[0]} ${last[1]}`;
}
