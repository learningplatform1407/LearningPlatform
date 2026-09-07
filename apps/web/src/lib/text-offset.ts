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
 * instead. Assumes non-overlapping annotations (v1 constraint).
 */
export function spliceAnnotations(text: string, annotations: Annotation[]): AnnotationSegment[] {
  const ranged = annotations
    .filter(
      (a): a is Annotation & { start_offset: number; end_offset: number } =>
        a.start_offset !== null && a.end_offset !== null,
    )
    .sort((a, b) => a.start_offset - b.start_offset);

  const segments: AnnotationSegment[] = [];
  let cursor = 0;
  for (const annotation of ranged) {
    if (annotation.start_offset > cursor) {
      segments.push({ text: text.slice(cursor, annotation.start_offset), annotation: null });
    }
    segments.push({ text: text.slice(annotation.start_offset, annotation.end_offset), annotation });
    cursor = annotation.end_offset;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), annotation: null });
  }
  return segments.length > 0 ? segments : [{ text, annotation: null }];
}
