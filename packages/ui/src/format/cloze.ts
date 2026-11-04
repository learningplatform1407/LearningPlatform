/**
 * What a hidden cloze gap shows (design.md §11). `hidden` is the exact text
 * the card covers; only its shape is used, never the text itself:
 *
 * - `lead` / `trail`: whitespace the card's range swallowed at either end,
 *   kept outside the gap so it doesn't glue to its neighbours;
 * - `label`: "[ … ]" with hints off, or each word's first letter followed by
 *   one underscore per remaining letter -- "[ m_______ ]" -- with hints on.
 *
 * Cloze cards are generated from the lesson text, so there is no authored
 * hint to show; first letter and length are what the text itself can give.
 */
export function clozeGap(
  hidden: string,
  hints: boolean,
): { lead: string; label: string; trail: string } {
  const lead = /^\s*/.exec(hidden)![0];
  const core = hidden.trim();
  const trail = core ? /\s*$/.exec(hidden)![0] : "";
  if (!hints || !core) return { lead, label: "[ … ]", trail };
  const shape = core
    .split(/\s+/)
    .map((word) => {
      const letters = [...word];
      // Long words cap at 12 marks: the hint is about shape, not a count.
      return letters[0] + "_".repeat(Math.min(letters.length - 1, 12));
    })
    .join(" ");
  return { lead, label: `[ ${shape} ]`, trail };
}
