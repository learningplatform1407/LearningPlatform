"use client";

import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { Annotation, ExtractedContent } from "@lp/contracts";
import { highlightIndex } from "@lp/ui";

import { NoteIcon } from "@/components/icons";
import { spliceAnnotations } from "@/lib/text-offset";
import { useI18n } from "@/lib/i18n";

import { ExtractedImage } from "./extracted-image";
import { wordRanges, type BlockRange, type LessonTool, type WordRange } from "./lesson-tools";

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

interface WordRef {
  gi: number;
  block: number;
  ws: number;
  we: number;
}

function wordFromElement(element: Element | null): WordRef | null {
  const word = element?.closest<HTMLElement>("[data-gi]");
  if (!word) return null;
  return {
    gi: Number(word.dataset.gi),
    block: Number(word.dataset.block),
    ws: Number(word.dataset.ws),
    we: Number(word.dataset.we),
  };
}

/**
 * The lesson in Text mode (design.md §9-10): sections under a top rule, and
 * every word its own span so marking is word-level.
 *
 * Words carry their block and *whole-word* offsets, so a drag snaps to word
 * boundaries however the pointer moved, and the result is stored as the
 * same block/offset annotations as before -- no contract change. Existing
 * highlights are still rendered from their exact offsets (spliceAnnotations),
 * so one made mid-word before the redesign still shows where it was.
 */
export function TextLessonView({
  blocks,
  annotations,
  tool,
  textScale,
  onMark,
  onOpenNote,
  sources,
}: {
  blocks: ExtractedBlock[];
  annotations: Annotation[];
  tool: LessonTool;
  textScale: number;
  /** Quiz-source passages per block, painted orange ("See in lesson"). */
  sources?: Map<number, { start: number; end: number }[]>;
  /** A finished drag (or tap) with a marking tool, split per block. */
  onMark: (ranges: BlockRange[]) => void;
  onOpenNote: (annotationId: string) => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const drag = useRef<{ anchor: WordRef; current: WordRef } | null>(null);
  const marking = tool !== null && tool.kind !== "pen";

  // Global word numbering across paragraphs, so a drag from one paragraph
  // into the next covers everything in between.
  const { wordsByBlock, firstWordIndex } = useMemo(() => {
    const words = new Map<number, WordRange[]>();
    const first = new Map<number, number>();
    let next = 0;
    blocks.forEach((block, index) => {
      if (block.type !== "paragraph") return;
      const ranges = wordRanges(block.text ?? "");
      words.set(index, ranges);
      first.set(index, next);
      next += ranges.length;
    });
    return { wordsByBlock: words, firstWordIndex: first };
  }, [blocks]);

  function paintPreview(from: number, to: number) {
    const article = articleRef.current;
    if (!article) return;
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    for (const element of article.querySelectorAll<HTMLElement>("[data-gi]")) {
      const gi = Number(element.dataset.gi);
      element.toggleAttribute("data-preview", gi >= lo && gi <= hi);
    }
  }

  function clearPreview() {
    for (const element of articleRef.current?.querySelectorAll("[data-preview]") ?? []) {
      element.removeAttribute("data-preview");
    }
  }

  function rangesBetween(a: WordRef, b: WordRef): BlockRange[] {
    const [first, last] = a.gi <= b.gi ? [a, b] : [b, a];
    const ranges: BlockRange[] = [];
    for (const [blockIndex, words] of wordsByBlock) {
      if (blockIndex < first.block || blockIndex > last.block || words.length === 0) continue;
      ranges.push({
        blockIndex,
        start: blockIndex === first.block ? first.ws : words[0]!.start,
        end: blockIndex === last.block ? last.we : words[words.length - 1]!.end,
      });
    }
    return ranges;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!marking || event.button > 0) return;
    const word = wordFromElement(event.target as Element);
    if (!word) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { anchor: word, current: word };
    paintPreview(word.gi, word.gi);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    // With the pointer captured, `target` stays the element the drag started
    // on, so hit-test the point instead. jsdom has no elementFromPoint.
    const hit =
      typeof document.elementFromPoint === "function"
        ? document.elementFromPoint(event.clientX, event.clientY)
        : (event.target as Element);
    const word = wordFromElement(hit);
    if (!word || word.gi === drag.current.current.gi) return;
    drag.current.current = word;
    paintPreview(drag.current.anchor.gi, word.gi);
  }

  function handlePointerUp() {
    const current = drag.current;
    drag.current = null;
    clearPreview();
    if (current) onMark(rangesBetween(current.anchor, current.current));
  }

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
            words={wordsByBlock.get(index) ?? []}
            firstWord={firstWordIndex.get(index) ?? 0}
            annotations={annotationsByBlock.get(index) ?? []}
            sources={sources?.get(index)}
            onOpenNote={onOpenNote}
          />
        );
      })}
    </article>
  );
}

function Paragraph({
  blockIndex,
  text,
  words,
  firstWord,
  annotations,
  sources,
  onOpenNote,
}: {
  blockIndex: number;
  text: string;
  words: WordRange[];
  firstWord: number;
  annotations: Annotation[];
  sources?: { start: number; end: number }[];
  onOpenNote: (annotationId: string) => void;
}) {
  const segments = spliceAnnotations(text, annotations);
  // Block-level notes (no offsets) predate range-anchored ones; their bubble
  // sits at the end of the paragraph.
  const blockNotes = annotations.filter((a) => a.type === "margin_note" && a.start_offset === null);

  let cursor = 0;
  let wordCursor = 0;
  const children: ReactNode[] = [];

  segments.forEach((segment, segmentIndex) => {
    const start = cursor;
    const end = start + segment.text.length;
    cursor = end;

    // The words (or parts of words) inside this segment, with the gaps
    // between them as plain text.
    const pieces: ReactNode[] = [];
    let at = start;
    while (wordCursor < words.length && words[wordCursor]!.end <= start) wordCursor += 1;
    for (let w = wordCursor; w < words.length && words[w]!.start < end; w += 1) {
      const word = words[w]!;
      const from = Math.max(word.start, start);
      const to = Math.min(word.end, end);
      if (from > at) pieces.push(text.slice(at, from));
      pieces.push(
        <span
          key={`w${w}`}
          data-gi={firstWord + w}
          data-block={blockIndex}
          data-ws={word.start}
          data-we={word.end}
          data-source={
            sources?.some((source) => word.start < source.end && word.end > source.start)
              ? ""
              : undefined
          }
          className="rounded-[2px] data-preview:bg-[rgba(47,111,159,0.16)] data-source:bg-[rgba(255,140,0,0.24)] data-source:shadow-[inset_0_-2px_#ff7a00]"
        >
          {text.slice(from, to)}
        </span>,
      );
      at = to;
    }
    if (at < end) pieces.push(text.slice(at, end));

    const annotation = segment.annotation;
    if (annotation?.type === "highlight") {
      children.push(
        <mark
          key={segmentIndex}
          data-annotation-id={annotation.id}
          className={`rounded-[2px] text-inherit ${highlightClass(annotation.color)}`}
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
      if (end === annotation.end_offset) {
        children.push(
          <NoteBubble key={`n${segmentIndex}`} onClick={() => onOpenNote(annotation.id)} />,
        );
      }
    } else {
      children.push(<span key={segmentIndex}>{pieces}</span>);
    }
  });

  return (
    <p data-block-index={blockIndex} className="my-2">
      {children}
      {blockNotes.map((note) => (
        <NoteBubble key={note.id} onClick={() => onOpenNote(note.id)} />
      ))}
    </p>
  );
}

/** The design's inline note bubble: accent circle, white note glyph. */
export function NoteBubble({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
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
