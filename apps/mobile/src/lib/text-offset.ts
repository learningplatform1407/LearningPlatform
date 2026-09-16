import type { Annotation } from "@lp/contracts";

export interface AnnotationSegment {
  text: string;
  annotation: Annotation | null;
}

/**
 * Splits `text` into plain/highlighted runs at each range-anchored
 * annotation's boundaries. Annotations without offsets (mobile's block-level
 * margin notes) are excluded — callers render those as a separate marker on
 * the block instead. Mirrors apps/web/src/lib/text-offset.ts's
 * spliceAnnotations — mobile can't create range-anchored annotations itself,
 * but it still needs to render highlights created on web against the same
 * shared data, overlapping ones included.
 *
 * Ranges can overlap (web lets a highlight be drawn over part of an existing
 * one, in a different color) — every distinct offset from every annotation
 * becomes a boundary, so each sub-range is emitted exactly once regardless
 * of how many annotations cover it, instead of the naive cursor-walk
 * re-emitting the overlapping text a second time. Where more than one
 * annotation covers the same sub-range, the most recently created one wins
 * the visual (it "paints over" the earlier one), matching how a real
 * highlighter behaves.
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
