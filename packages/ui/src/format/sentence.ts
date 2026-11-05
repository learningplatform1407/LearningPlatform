/**
 * The sentence holding the range `start`..`end` of `text`, as offsets --
 * what the Review cards view shows around a gap (design.md §11). Sentences
 * end at . ! ? or ; followed by a space (or the end of the text).
 */
export function sentenceAround(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const startMatch = [...before.matchAll(/[.!?;]\s+/g)].pop();
  const from = startMatch ? startMatch.index + startMatch[0].length : 0;
  const endMatch = after.match(/[.!?;](\s|$)/);
  const to = endMatch ? end + (endMatch.index ?? 0) + 1 : text.length;
  return { start: from, end: to };
}
