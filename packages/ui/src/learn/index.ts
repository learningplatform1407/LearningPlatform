/** How long the Learn hub's "Recently opened" list is.
 *
 * Shared rather than written twice: the hub is the same screen on both
 * platforms, and a hub that lists three lessons on the phone and five in the
 * browser is the kind of drift nobody notices until it is reported as a bug.
 *
 * Three, not five: the newest lesson is already pulled out above as
 * "Continue", so this list is the tail behind it -- a shortcut back to the
 * handful of lessons still in play, not a history. The Library is where every
 * lesson lives.
 */
export const RECENT_LESSONS_SHOWN = 3;

/** How many of the people-you-follow events the profile page lists.
 *
 * Three, like RECENT_LESSONS_SHOWN above and for the same reason: this is a
 * glance at what happened, with "See all" right beside it for the rest. Five
 * filled half a phone screen with other people's exam scores before the
 * reader ever reached their own stats.
 */
export const RECENT_ACTIVITY_SHOWN = 3;

/**
 * The end of the word that `at` falls inside, or `at` itself when it already
 * sits on a boundary.
 *
 * Where an inline note's marker goes. A note anchored to a drag that stopped
 * mid-word used to put its marker exactly there, splitting the word around a
 * bubble ("beha|✎|viour"); the marker belongs after the word instead. The
 * note's own range is untouched -- its underline still shows exactly what was
 * picked, which is the thing the reader chose.
 */
export function wordEndAfter(text: string, at: number): number {
  let end = Math.max(0, Math.min(at, text.length));
  while (end < text.length && !/\s/u.test(text[end]!)) end += 1;
  return end;
}

/**
 * Cuts text segments further at each of `offsets`, counted from the start of
 * the whole text.
 *
 * Both readers build their paragraphs from runs produced by
 * `spliceAnnotations`, whose only boundaries are the annotations' own edges.
 * An inline marker has to land somewhere that is not one of those (the end of
 * a word, above), so the offset is made into a boundary first and the marker
 * then goes where a run ends, exactly as before.
 */
export function splitSegmentsAt<T extends { text: string }>(
  segments: T[],
  offsets: readonly number[],
): T[] {
  if (offsets.length === 0) return segments;
  const out: T[] = [];
  let at = 0;
  for (const segment of segments) {
    const start = at;
    const end = start + segment.text.length;
    at = end;
    const cuts = [...new Set(offsets.filter((offset) => offset > start && offset < end))].sort(
      (a, b) => a - b,
    );
    let from = start;
    for (const cut of [...cuts, end]) {
      out.push({ ...segment, text: segment.text.slice(from - start, cut - start) });
      from = cut;
    }
  }
  return out;
}

/** The shape of a range-anchored annotation this module needs to see. */
interface RangeMark {
  type: string;
  block_index: number;
  start_offset: number | null;
  end_offset: number | null;
}

/**
 * What marking [start, end) in a block does to the highlights already under
 * it: the ones to delete, and the pieces of them that survive either side.
 *
 * Used by the eraser, which is where it started, *and* by the highlighter --
 * a new colour over an old one replaces the part it covers rather than
 * stacking on top of it. Stacking was the bug behind "highlighting over a
 * highlight doesn't override it": two annotations then covered the same
 * words, the renderers resolved that by creation time, and the eraser's
 * delete-and-recreate (there is no resize endpoint) gave the older of the two
 * a *newer* creation time -- so rubbing out a neighbouring word could bring
 * the colour underneath back to the top. With the overlap trimmed away on the
 * way in, there is only ever one highlight over a given word and none of that
 * can happen.
 */
export function clearHighlightRange<T extends RangeMark>(
  marks: readonly T[],
  blockIndex: number,
  start: number,
  end: number,
): { remove: T[]; keep: { mark: T; start: number; end: number }[] } {
  const remove: T[] = [];
  const keep: { mark: T; start: number; end: number }[] = [];
  for (const mark of marks) {
    if (mark.type !== "highlight" || mark.block_index !== blockIndex) continue;
    const from = mark.start_offset;
    const to = mark.end_offset;
    if (from === null || to === null) continue;
    if (from >= end || to <= start) continue;
    remove.push(mark);
    if (from < start) keep.push({ mark, start: from, end: start });
    if (to > end) keep.push({ mark, start: end, end: to });
  }
  return { remove, keep };
}

/** A normalised [x0, y0, x1, y1] box on a page, 0-1 in both axes. */
type PageRect = [number, number, number, number];

// Narrower than this and a kept piece is nothing but the padding
// `rectsForWords` adds around a run (0.002 a side), not print.
const MIN_RECT_WIDTH = 0.004;

/** Whether two boxes sit on the same printed line: their heights overlap by
 * more than half of the shorter one. Word boxes on one line share a baseline;
 * boxes on different lines barely touch. */
function sameLine(a: PageRect, b: PageRect): boolean {
  const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return overlap > 0 && overlap >= 0.5 * Math.min(a[3] - a[1], b[3] - b[1]);
}

/**
 * The page's highlights with everything under `covered` taken out of them --
 * `clearHighlightRange` for a PDF page, where a mark is boxes rather than
 * offsets.
 *
 * A page's highlights are stored as one box per run of words on a line, so
 * "take this out" is a horizontal cut through the boxes on the same line: a
 * box is kept whole, trimmed to one side, or split in two around the new
 * mark. Without it a second colour over the first left both in place and the
 * two translucent fills mixed into a third colour that is in neither swatch.
 */
export function clearHighlightRects<T extends { rects: PageRect[] }>(
  highlights: readonly T[],
  covered: readonly PageRect[],
): T[] {
  const kept: T[] = [];
  for (const highlight of highlights) {
    const rects = highlight.rects.flatMap((rect) => {
      let pieces: PageRect[] = [rect];
      for (const other of covered) {
        if (!sameLine(rect, other)) continue;
        pieces = pieces.flatMap(([x0, y0, x1, y1]): PageRect[] => {
          if (other[2] <= x0 || other[0] >= x1) return [[x0, y0, x1, y1]];
          const out: PageRect[] = [];
          if (other[0] > x0) out.push([x0, y0, Math.min(other[0], x1), y1]);
          if (other[2] < x1) out.push([Math.max(other[2], x0), y0, x1, y1]);
          return out;
        });
      }
      return pieces.filter(([x0, , x1]) => x1 - x0 >= MIN_RECT_WIDTH);
    });
    if (rects.length > 0) kept.push({ ...highlight, rects });
  }
  return kept;
}
