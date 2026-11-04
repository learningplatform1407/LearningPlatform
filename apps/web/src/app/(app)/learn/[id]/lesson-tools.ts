import { HIGHLIGHT_COLOR_NAMES, type HighlightColorName } from "@lp/ui";

export type LessonTab = "lesson" | "review" | "quizzes" | "flashcards";
export type LessonViewMode = "text" | "pdf";

/** Index into the five swatches (yellow, blue, purple, red, green). */
export type SwatchIndex = 0 | 1 | 2 | 3 | 4;

export type LessonTool =
  | { kind: "highlight"; color: SwatchIndex }
  | { kind: "pen"; color: SwatchIndex }
  | { kind: "eraser" }
  | { kind: "note" }
  | null;

export function colorName(index: SwatchIndex): HighlightColorName {
  return HIGHLIGHT_COLOR_NAMES[index];
}

/** The swatch rule from design.md §5: with the pen active a swatch recolours
 * the pen; otherwise it picks that marker, and picking the active marker
 * again turns it off. */
export function pickSwatch(tool: LessonTool, color: SwatchIndex): LessonTool {
  if (tool?.kind === "pen") return { kind: "pen", color };
  if (tool?.kind === "highlight" && tool.color === color) return null;
  return { kind: "highlight", color };
}

/** Whether a tool can be used in a given view. The pen draws on PDF pages
 * only; notes anchor to lesson text only (PDF highlights have no notes). */
export function toolAvailable(kind: NonNullable<LessonTool>["kind"], mode: LessonViewMode) {
  if (kind === "pen") return mode === "pdf";
  if (kind === "note") return mode === "text";
  return true;
}

export interface WordRange {
  start: number;
  end: number;
}

/** Word boundaries in `text`: runs of non-whitespace. Marking snaps to
 * these, so a highlight never starts or stops mid-word however the pointer
 * moved. */
export function wordRanges(text: string): WordRange[] {
  const words: WordRange[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    words.push({ start: match.index, end: match.index + match[0].length });
  }
  return words;
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
