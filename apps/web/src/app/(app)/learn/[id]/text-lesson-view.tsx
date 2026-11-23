"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { Annotation, ExtractedContent } from "@lp/contracts";
import { highlightIndex, splitSegmentsAt, wordEndAfter } from "@lp/ui";

import { NoteIcon } from "@/components/icons";
import { spliceAnnotations } from "@/lib/text-offset";
import { useI18n } from "@/lib/i18n";

import { ExtractedImage } from "./extracted-image";
import { letterRanges, type BlockRange, type LessonTool, type LetterRange } from "./lesson-tools";

type ExtractedBlock = ExtractedContent["blocks"][number];

const HIGHLIGHT_CLASSES = [
  "bg-highlight0",
  "bg-highlight1",
  "bg-highlight2",
  "bg-highlight3",
  "bg-highlight4",
] as const;

export function highlightClass(color: string | null): string {
  return HIGHLIGHT_CLASSES[highlightIndex(color)];
}

export function headingId(blockIndex: number): string {
  return `lesson-heading-${blockIndex}`;
}

interface LetterRef {
  gi: number;
  block: number;
  start: number;
  end: number;
}

function letterFromElement(element: Element | null): LetterRef | null {
  const letter = element?.closest<HTMLElement>("[data-gi]");
  if (!letter) return null;
  return {
    gi: Number(letter.dataset.gi),
    block: Number(letter.dataset.block),
    start: Number(letter.dataset.ls),
    end: Number(letter.dataset.le),
  };
}

/**
 * The lesson in Text mode (design.md §9-10): sections under a top rule, and
 * every letter its own span so marking is letter-level.
 *
 * Letters carry their block and offsets, so a drag covers exactly the
 * letters from where it started to where it ended, and the result is stored
 * as the same block/offset annotations as before -- no contract change.
 * Highlights are rendered from their exact offsets (spliceAnnotations), so
 * marks made word by word before this still show where they were.
 */
export function TextLessonView({
  blocks,
  annotations,
  tool,
  textScale,
  onMark,
  onOpenNote,
  sources,
  clozeWords,
}: {
  blocks: ExtractedBlock[];
  annotations: Annotation[];
  tool: LessonTool;
  textScale: number;
  /** Quiz-source passages per block, painted orange ("See in lesson"). */
  sources?: Map<number, { start: number; end: number }[]>;
  /**
   * The words the Review tab hides, per block, underlined in the cloze
   * colour. Passed only while an admin holds the review-word tool: for a
   * learner this would show every answer in the lesson at a glance.
   *
   * Painted per letter, like `sources`, rather than spliced into the
   * annotation runs -- a review word is not an annotation and must not
   * compete with a highlight for the run it overlaps.
   */
  clozeWords?: Map<number, { start: number; end: number }[]>;
  /** A finished drag (or tap) with a marking tool, split per block. */
  onMark: (ranges: BlockRange[]) => void;
  onOpenNote: (annotationId: string) => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const drag = useRef<{ anchor: LetterRef; current: LetterRef } | null>(null);
  // The letters' spans by global index, collected when a drag starts, and
  // the span of them currently painted -- so each pointer move repaints only
  // what changed rather than walking every letter of the lesson.
  const letterElements = useRef<HTMLElement[]>([]);
  const painted = useRef<[number, number] | null>(null);
  const marking = tool !== null && tool.kind !== "pen";

  // Global letter numbering across paragraphs, so a drag from one paragraph
  // into the next covers everything in between.
  const { lettersByBlock, firstLetterIndex } = useMemo(() => {
    const letters = new Map<number, LetterRange[]>();
    const first = new Map<number, number>();
    let next = 0;
    blocks.forEach((block, index) => {
      if (block.type !== "paragraph") return;
      const ranges = letterRanges(block.text ?? "");
      letters.set(index, ranges);
      first.set(index, next);
      next += ranges.length;
    });
    return { lettersByBlock: letters, firstLetterIndex: first };
  }, [blocks]);

  function setPreview(lo: number, hi: number, on: boolean) {
    for (let gi = lo; gi <= hi; gi += 1) {
      letterElements.current[gi]?.toggleAttribute("data-preview", on);
    }
  }

  function paintPreview(from: number, to: number) {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    if (painted.current) setPreview(painted.current[0], painted.current[1], false);
    setPreview(lo, hi, true);
    painted.current = [lo, hi];
  }

  function clearPreview() {
    if (painted.current) setPreview(painted.current[0], painted.current[1], false);
    painted.current = null;
    letterElements.current = [];
  }

  function rangesBetween(a: LetterRef, b: LetterRef): BlockRange[] {
    const [first, last] = a.gi <= b.gi ? [a, b] : [b, a];
    const ranges: BlockRange[] = [];
    for (const [blockIndex, letters] of lettersByBlock) {
      if (blockIndex < first.block || blockIndex > last.block || letters.length === 0) continue;
      ranges.push({
        blockIndex,
        start: blockIndex === first.block ? first.start : letters[0]!.start,
        end: blockIndex === last.block ? last.end : letters[letters.length - 1]!.end,
      });
    }
    return ranges;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!marking || event.button > 0) return;
    const letter = letterFromElement(event.target as Element);
    if (!letter) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const elements: HTMLElement[] = [];
    for (const element of articleRef.current?.querySelectorAll<HTMLElement>("[data-gi]") ?? []) {
      elements[Number(element.dataset.gi)] = element;
    }
    letterElements.current = elements;
    drag.current = { anchor: letter, current: letter };
    paintPreview(letter.gi, letter.gi);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    // With the pointer captured, `target` stays the element the drag started
    // on, so hit-test the point instead. jsdom has no elementFromPoint.
    const hit =
      typeof document.elementFromPoint === "function"
        ? document.elementFromPoint(event.clientX, event.clientY)
        : (event.target as Element);
    const letter = letterFromElement(hit);
    if (!letter || letter.gi === drag.current.current.gi) return;
    drag.current.current = letter;
    paintPreview(drag.current.anchor.gi, letter.gi);
  }

  function handlePointerUp() {
    const current = drag.current;
    drag.current = null;
    clearPreview();
    if (current) onMark(rangesBetween(current.anchor, current.current));
  }

  // Paragraphs are memoised (there is a span per letter), so the note
  // callback has to keep one identity across the parent's renders.
  const openNoteRef = useRef(onOpenNote);
  useEffect(() => {
    openNoteRef.current = onOpenNote;
  });
  const openNote = useCallback((id: string) => openNoteRef.current(id), []);

  const annotationsByBlock = useMemo(() => {
    const byBlock = new Map<number, Annotation[]>();
    for (const annotation of annotations) {
      const list = byBlock.get(annotation.block_index) ?? [];
      list.push(annotation);
      byBlock.set(annotation.block_index, list);
    }
    return byBlock;
  }, [annotations]);

  return (
    <article
      ref={articleRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      data-marking={marking || undefined}
      style={{ fontSize: `${(17 * textScale) / 100}px` }}
      className="leading-[1.6] font-medium text-foreground data-marking:cursor-text data-marking:touch-none data-marking:select-none"
    >
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3
              key={index}
              id={headingId(index)}
              data-heading-index={index}
              className="mt-[20px] scroll-mt-[88px] border-t border-border pt-lg pb-1.5 text-[1.3em] leading-[1.25] font-extrabold first:mt-0"
            >
              {block.text}
            </h3>
          );
        }
        if (block.type === "image") {
          return block.image_path ? (
            <div key={index} className="my-sm">
              <ExtractedImage path={block.image_path} />
            </div>
          ) : null;
        }
        return (
          <Paragraph
            key={index}
            blockIndex={index}
            text={block.text ?? ""}
            letters={lettersByBlock.get(index) ?? NO_LETTERS}
            firstLetter={firstLetterIndex.get(index) ?? 0}
            annotations={annotationsByBlock.get(index) ?? NO_ANNOTATIONS}
            sources={sources?.get(index)}
            clozeWords={clozeWords?.get(index)}
            onOpenNote={openNote}
          />
        );
      })}
    </article>
  );
}

const NO_LETTERS: LetterRange[] = [];
const NO_ANNOTATIONS: Annotation[] = [];

const Paragraph = memo(function Paragraph({
  blockIndex,
  text,
  letters,
  firstLetter,
  annotations,
  sources,
  clozeWords,
  onOpenNote,
}: {
  blockIndex: number;
  text: string;
  letters: LetterRange[];
  firstLetter: number;
  annotations: Annotation[];
  sources?: { start: number; end: number }[];
  clozeWords?: { start: number; end: number }[];
  onOpenNote: (annotationId: string) => void;
}) {
  // Block-level notes (no offsets) predate range-anchored ones; their bubble
  // sits at the end of the paragraph.
  const blockNotes = annotations.filter((a) => a.type === "margin_note" && a.start_offset === null);
  const rangeNotes = annotations.filter(
    (a): a is Annotation & { start_offset: number; end_offset: number } =>
      a.type === "margin_note" && a.start_offset !== null && a.end_offset !== null,
  );
  // A bubble goes after the word its note stops in, never inside it: a note
  // taken from a drag that ended mid-word used to break the word around a
  // 22px circle. The word's end is not an annotation boundary, so the runs
  // are cut there too -- `wordEndAfter` and `splitSegmentsAt` do the same job
  // in the phone's reader.
  const bubbleOffset = (note: Annotation) => wordEndAfter(text, note.end_offset ?? 0);
  const segments = splitSegmentsAt(
    spliceAnnotations(text, annotations),
    rangeNotes.map(bubbleOffset),
  );

  let cursor = 0;
  let letterCursor = 0;
  const children: ReactNode[] = [];
  const bubbled = new Set<string>();

  segments.forEach((segment, segmentIndex) => {
    const start = cursor;
    const end = start + segment.text.length;
    cursor = end;

    // The letters inside this segment, with the whitespace between them as
    // plain text.
    const pieces: ReactNode[] = [];
    let at = start;
    while (letterCursor < letters.length && letters[letterCursor]!.end <= start) letterCursor += 1;
    for (let l = letterCursor; l < letters.length && letters[l]!.start < end; l += 1) {
      const letter = letters[l]!;
      if (letter.start > at) pieces.push(text.slice(at, letter.start));
      pieces.push(
        <span
          key={`l${l}`}
          data-gi={firstLetter + l}
          data-block={blockIndex}
          data-ls={letter.start}
          data-le={letter.end}
          data-source={
            sources?.some((source) => letter.start < source.end && letter.end > source.start)
              ? ""
              : undefined
          }
          data-cloze={
            clozeWords?.some((word) => letter.start < word.end && letter.end > word.start)
              ? ""
              : undefined
          }
          className="data-preview:bg-[rgba(47,111,159,0.16)] data-source:bg-[rgba(255,140,0,0.24)] data-source:shadow-[inset_0_-2px_#ff7a00] data-cloze:bg-cloze-bg data-cloze:shadow-[inset_0_-2px_var(--cloze)]"
        >
          {text.slice(letter.start, letter.end)}
        </span>,
      );
      at = letter.end;
    }
    if (at < end) pieces.push(text.slice(at, end));

    const annotation = segment.annotation;
    if (annotation?.type === "highlight") {
      // Corners only where the colour ends: rounded where it meets another
      // highlight, they cut a notch into the run at the join.
      const isHighlight = (other?: { annotation: Annotation | null }) =>
        other?.annotation?.type === "highlight";
      const corners = [
        isHighlight(segments[segmentIndex - 1]) ? "" : "rounded-l-[2px]",
        isHighlight(segments[segmentIndex + 1]) ? "" : "rounded-r-[2px]",
      ].join(" ");
      children.push(
        <mark
          key={segmentIndex}
          data-annotation-id={annotation.id}
          className={`${corners} text-inherit ${highlightClass(annotation.color)}`}
        >
          {pieces}
        </mark>,
      );
    } else if (annotation?.type === "margin_note") {
      children.push(
        <span
          key={segmentIndex}
          data-annotation-id={annotation.id}
          className="border-b-2 border-dashed border-accent"
        >
          {pieces}
        </span>,
      );
    } else {
      children.push(<span key={segmentIndex}>{pieces}</span>);
    }

    // Read from the paragraph's notes rather than from whichever annotation
    // won this run: a highlight drawn across a note wins the run and used to
    // take the bubble down with it, leaving the note unreachable.
    for (const note of rangeNotes) {
      if (bubbled.has(note.id) || bubbleOffset(note) !== end) continue;
      bubbled.add(note.id);
      children.push(
        <NoteBubble key={`n${note.id}`} noteId={note.id} onClick={() => onOpenNote(note.id)} />,
      );
    }
  });

  // A note anchored past the end of the text it was written on -- a
  // paragraph edited shorter under it. `spliceAnnotations` clamps it, so no
  // run ends where it does; its bubble goes last rather than nowhere.
  for (const note of rangeNotes) {
    if (!bubbled.has(note.id)) {
      children.push(
        <NoteBubble key={`n${note.id}`} noteId={note.id} onClick={() => onOpenNote(note.id)} />,
      );
    }
  }

  return (
    <p data-block-index={blockIndex} className="my-2">
      {children}
      {blockNotes.map((note) => (
        <NoteBubble key={note.id} noteId={note.id} onClick={() => onOpenNote(note.id)} />
      ))}
    </p>
  );
});

/** The design's inline note bubble: accent circle, white note glyph. */
export function NoteBubble({ noteId, onClick }: { noteId: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      // The note pop-up finds its bubble by this, to sit beside it.
      data-note-bubble={noteId}
      aria-label={t("lesson.panel.openNote")}
      // Stops a marking tool's drag from starting on the bubble itself.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      className="relative mx-0.5 inline-flex h-[22px] w-[22px] -translate-y-0.5 items-center justify-center rounded-full bg-[#2f6f9f] align-middle text-white shadow-bubble"
    >
      <NoteIcon size={13} />
    </button>
  );
}
