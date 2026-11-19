/**
 * Which letter of a paragraph is under a finger.
 *
 * React Native reports where a paragraph's lines fall (`onTextLayout`) but
 * not where each character on a line starts, and there is no way to measure
 * text from JS. So each line's measured width is shared out between its
 * characters in proportion to typical sans-serif advance widths -- an "i"
 * gets a quarter of a "W" -- which lands within a letter of the truth on
 * ordinary prose, and exactly at both ends of every line.
 */

/** The fields of RN's `TextLayoutLine` this module reads. */
export interface TextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Advance widths in thousandths of an em, from a typical sans-serif (Arial
// / Helvetica metrics). Only ratios matter: each line is scaled to its own
// measured width.
const WIDTHS: Record<string, number> = {};
function assign(chars: string, width: number) {
  for (const ch of chars) WIDTHS[ch] = width;
}
assign("ijl|", 222);
assign("ftI![]()/\\.,:;'`", 278);
assign("r-", 333);
assign('"*', 355);
assign("cksvxyzJ", 500);
assign("abdeghnopqu0123456789$#_?L", 556);
assign("FTZ", 611);
assign("ABEKPSVXY&", 667);
assign("CDHNRUw", 722);
assign("GOQ", 778);
assign("mM", 833);
assign("W%", 944);
const DEFAULT_WIDTH = 556;

/** A character's typical advance width, in thousandths of an em. */
export function charWidth(ch: string): number {
  if (/\s/u.test(ch)) return 278;
  // A letter with diacritics ("ș", "é") is as wide as its base letter.
  const base = ch.normalize("NFD")[0] ?? ch;
  return WIDTHS[base] ?? DEFAULT_WIDTH;
}

/** Each line's offset into the paragraph's text. RN's lines carry their
 * text, including the whitespace they wrap at, so they add up to it. */
function lineStarts(lines: TextLine[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.text.length;
  }
  return starts;
}

/** A letter's place in the paragraph's text: [start, end) in UTF-16 units. */
export interface LetterSpan {
  start: number;
  end: number;
}

/**
 * The letter (any character but whitespace) at a point in the paragraph's
 * own coordinates. A point between lines counts for the nearer one; a point
 * on a space, or past either end of a line, for the nearest letter on that
 * line. Null only when the paragraph has no letters.
 */
export function letterAtPoint(lines: TextLine[], x: number, y: number): LetterSpan | null {
  if (lines.length === 0) return null;
  const starts = lineStarts(lines);

  // The line under the point, or the nearest one.
  let lineIndex = 0;
  let best = Infinity;
  lines.forEach((line, index) => {
    const distance =
      y < line.y ? line.y - y : y > line.y + line.height ? y - line.y - line.height : 0;
    if (distance < best) {
      best = distance;
      lineIndex = index;
    }
  });
  const line = lines[lineIndex]!;

  // Characters (code points) of the line, with their share of its width.
  // Whitespace at the end of a line is where it wrapped, and takes none.
  const chars = [...line.text.matchAll(/[\s\S]/gu)].map((match) => ({
    start: match.index,
    text: match[0],
  }));
  let visible = chars.length;
  while (visible > 0 && /\s/u.test(chars[visible - 1]!.text)) visible -= 1;
  const total = chars.slice(0, visible).reduce((sum, ch) => sum + charWidth(ch.text), 0);
  const scale = total > 0 ? line.width / total : 0;

  // The character the point falls in.
  let target = Math.max(0, visible - 1);
  let edge = line.x;
  for (let i = 0; i < visible; i += 1) {
    edge += charWidth(chars[i]!.text) * scale;
    if (x < edge) {
      target = i;
      break;
    }
  }

  // On whitespace: the nearer letter either side of it, on this line.
  const isLetter = (i: number) => i >= 0 && i < visible && !/\s/u.test(chars[i]!.text);
  for (let reach = 0; reach < visible; reach += 1) {
    const pick = isLetter(target - reach)
      ? target - reach
      : isLetter(target + reach)
        ? target + reach
        : -1;
    if (pick >= 0) {
      const ch = chars[pick]!;
      const start = starts[lineIndex]! + ch.start;
      return { start, end: start + ch.text.length };
    }
  }
  return null;
}
