import type { Annotation } from "@lp/contracts";

/**
 * Plain-text start/end offsets of `range` within `container`, computed by
 * walking `container`'s text nodes in document order (same technique used by
 * annotation tools like Hypothesis). `null` if `range` isn't fully inside
 * `container`.
 */
export function getOffsetsWithinContainer(
  container: Node,
  range: Range,
): { start: number; end: number } | null {
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let start: number | null = null;
  let end: number | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node === range.startContainer) {
      start = offset + range.startOffset;
    }
    if (node === range.endContainer) {
      end = offset + range.endOffset;
    }
    offset += node.textContent?.length ?? 0;
  }

  if (start === null || end === null) return null;
  return { start, end };
}

/** Walks up from `node` to the nearest ancestor element carrying `data-block-index`. */
export function findBlockElement(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
  return el?.closest("[data-block-index]") ?? null;
}

export interface AnnotationSegment {
  text: string;
  annotation: Annotation | null;
}

/**
 * Splits `text` into plain/highlighted runs at each range-anchored
 * annotation's boundaries. Annotations without offsets (block-level margin
 * notes) are excluded — callers render those as a marker on the block
 * instead.
 *
 * Ranges can now overlap (e.g. highlighting a word that's already inside an
 * earlier highlight, with a different color) — every distinct offset from
 * every annotation becomes a boundary, so each sub-range is emitted exactly
 * once regardless of how many annotations cover it, instead of the naive
 * cursor-walk re-emitting the overlapping text a second time. Where more
 * than one annotation covers the same sub-range, the most recently created
 * one wins the visual (it "paints over" the earlier one), matching how a
 * real highlighter behaves.
 */
export function spliceAnnotations(text: string, annotations: Annotation[]): AnnotationSegment[] {
  const ranged = annotations.filter(
    (a): a is Annotation & { start_offset: number; end_offset: number } =>
      a.start_offset !== null && a.end_offset !== null,
  );

  if (ranged.length === 0) {
    return [{ text, annotation: null }];
  }

  const boundaries = new Set<number>([0, text.length]);
  for (const a of ranged) {
    boundaries.add(Math.max(0, Math.min(a.start_offset, text.length)));
    boundaries.add(Math.max(0, Math.min(a.end_offset, text.length)));
  }
  const points = [...boundaries].sort((x, y) => x - y);

  const segments: AnnotationSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (start === end) continue;

    const covering = ranged.filter((a) => a.start_offset <= start && a.end_offset >= end);
    const winner =
      covering.length === 0
        ? null
        : covering.reduce((latest, a) => (a.created_at > latest.created_at ? a : latest));

    segments.push({ text: text.slice(start, end), annotation: winner });
  }
  return segments;
}
