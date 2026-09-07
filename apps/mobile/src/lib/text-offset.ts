import type { Annotation } from "@lp/contracts";

export interface AnnotationSegment {
  text: string;
  annotation: Annotation | null;
}

/**
 * Splits `text` into plain/highlighted runs at each range-anchored
 * annotation's boundaries. Annotations without offsets (mobile's block-level
 * margin notes) are excluded — callers render those as a separate marker on
 * the block instead. Assumes non-overlapping annotations (v1 constraint).
 * Mirrors apps/web/src/lib/text-offset.ts's spliceAnnotations — mobile can't
 * create range-anchored annotations itself, but it still needs to render
 * highlights created on web against the same shared data.
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
