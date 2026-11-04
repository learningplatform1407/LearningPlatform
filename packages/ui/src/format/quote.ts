/**
 * Where a quoted passage sits in `text`, matching whitespace loosely (a line
 * break in the lesson against a space in the quote is still a match) --
 * the same rule the API applies (app/questions/service.py) when a question's source quotes are saved.
 * Null when the passage isn't there.
 */
export function findQuote(text: string, quote: string): { start: number; end: number } | null {
  const words = quote.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = new RegExp(escaped.join("\\s+")).exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
