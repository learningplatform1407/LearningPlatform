import { HIGHLIGHT_COLOR_NAMES, type HighlightColorName, type PenSize } from "@lp/ui";

export type LessonTab = "lesson" | "review" | "quizzes" | "flashcards";
export type LessonViewMode = "text" | "pdf";

/** Index into the five swatches (yellow, blue, purple, red, green). */
export type SwatchIndex = 0 | 1 | 2 | 3 | 4;

export type LessonTool =
  | { kind: "highlight"; color: SwatchIndex }
  | { kind: "pen"; color: SwatchIndex; size: PenSize }
  | { kind: "eraser" }
  | { kind: "note" }
  // Admin only: marks which words the Review tab hides. Offered from the
  // lesson itself, because the only way to choose a good gap is to read the
  // sentence around it (docs/architecture/review-words.md).
  | { kind: "cloze" }
  | null;

export function colorName(index: SwatchIndex): HighlightColorName {
  return HIGHLIGHT_COLOR_NAMES[index];
}

/** The swatch rule from design.md §5: with the pen active a swatch recolours
 * the pen; otherwise it picks that marker, and picking the active marker
 * again turns it off. */
export function pickSwatch(tool: LessonTool, color: SwatchIndex): LessonTool {
  if (tool?.kind === "pen") return { ...tool, color };
  if (tool?.kind === "highlight" && tool.color === color) return null;
  return { kind: "highlight", color };
}

/** Whether a tool can be used in a given view. The pen draws on PDF pages
 * only; notes anchor to lesson text only (PDF highlights have no notes), and
 * so do review words -- a cloze card is a pair of offsets into an extracted
 * paragraph, which only the text view renders. */
export function toolAvailable(kind: NonNullable<LessonTool>["kind"], mode: LessonViewMode) {
  if (kind === "pen") return mode === "pdf";
  if (kind === "note" || kind === "cloze") return mode === "text";
  return true;
}

export interface LetterRange {
  start: number;
  end: number;
}

/** Each letter of `text` -- every character but whitespace -- with its
 * offsets. Marking moves letter by letter, so a highlight can start or stop
 * inside a word; it never starts or stops on a space, because only letters
 * can be pressed. A code point rather than a UTF-16 unit, so a character
 * outside the BMP is one letter, not two halves. */
export function letterRanges(text: string): LetterRange[] {
  const letters: LetterRange[] = [];
  for (const match of text.matchAll(/\S/gu)) {
    letters.push({ start: match.index, end: match.index + match[0].length });
  }
  return letters;
}

/** One block's slice of a marked range. A drag can run across paragraphs,
 * but annotations are per block, so a mark is stored as one per block. */
export interface BlockRange {
  blockIndex: number;
  start: number;
  end: number;
}

export const TEXT_SCALES = [100, 110, 120, 130, 140, 150] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export function nextTextScale(current: TextScale): TextScale {
  const index = TEXT_SCALES.indexOf(current);
  return TEXT_SCALES[(index + 1) % TEXT_SCALES.length]!;
}
