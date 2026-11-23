import { describe, expect, it } from "vitest";

import { clearHighlightRange, clearHighlightRects, splitSegmentsAt, wordEndAfter } from "./index";

describe("wordEndAfter", () => {
  const text = "Mitochondria make the cell's energy.";

  it("runs on to the end of a word a mid-word offset falls in", () => {
    expect(wordEndAfter(text, 5)).toBe("Mitochondria".length);
  });

  it("leaves an offset already on a boundary alone", () => {
    const end = "Mitochondria".length;
    expect(wordEndAfter(text, end)).toBe(end);
  });

  it("stops at the end of the text", () => {
    expect(wordEndAfter(text, text.length)).toBe(text.length);
    expect(wordEndAfter("abc", 1)).toBe(3);
  });
});

describe("splitSegmentsAt", () => {
  it("cuts a run at an offset inside it, keeping the rest of the segment", () => {
    const segments = [{ text: "abcdef", mark: "x" }];
    expect(splitSegmentsAt(segments, [2])).toEqual([
      { text: "ab", mark: "x" },
      { text: "cdef", mark: "x" },
    ]);
  });

  it("ignores offsets on a boundary or outside the text", () => {
    const segments = [{ text: "abc" }, { text: "def" }];
    expect(splitSegmentsAt(segments, [0, 3, 6, 99])).toEqual(segments);
  });

  it("takes several cuts in one run, in order", () => {
    expect(splitSegmentsAt([{ text: "abcdef" }], [4, 2])).toEqual([
      { text: "ab" },
      { text: "cd" },
      { text: "ef" },
    ]);
  });
});

describe("clearHighlightRange", () => {
  const mark = (id: string, start: number, end: number, block = 0) => ({
    id,
    type: "highlight",
    block_index: block,
    start_offset: start,
    end_offset: end,
  });

  it("deletes a highlight the new mark covers whole", () => {
    const yellow = mark("y", 4, 8);
    const { remove, keep } = clearHighlightRange([yellow], 0, 0, 10);
    expect(remove).toEqual([yellow]);
    expect(keep).toEqual([]);
  });

  it("keeps the parts either side of the new mark", () => {
    const yellow = mark("y", 0, 20);
    const { remove, keep } = clearHighlightRange([yellow], 0, 5, 10);
    expect(remove).toEqual([yellow]);
    expect(keep).toEqual([
      { mark: yellow, start: 0, end: 5 },
      { mark: yellow, start: 10, end: 20 },
    ]);
  });

  it("leaves highlights that only touch the range, other blocks, and notes", () => {
    const note = { ...mark("n", 0, 20), type: "margin_note" };
    const marks = [mark("before", 0, 5), mark("after", 10, 20), mark("other", 0, 20, 1), note];
    expect(clearHighlightRange(marks, 0, 5, 10)).toEqual({ remove: [], keep: [] });
  });

  it("skips a block-level annotation with no offsets", () => {
    const whole = { ...mark("w", 0, 0), start_offset: null, end_offset: null };
    expect(clearHighlightRange([whole], 0, 0, 10).remove).toEqual([]);
  });
});

describe("clearHighlightRects", () => {
  // One printed line, y 0.10-0.14; the second line sits well below it.
  const line = (x0: number, x1: number): [number, number, number, number] => [x0, 0.1, x1, 0.14];
  const below = (x0: number, x1: number): [number, number, number, number] => [x0, 0.2, x1, 0.24];

  it("splits a run the new mark lands in the middle of", () => {
    const kept = clearHighlightRects(
      [{ color: "yellow", rects: [line(0.1, 0.5)] }],
      [line(0.25, 0.35)],
    );
    expect(kept).toEqual([{ color: "yellow", rects: [line(0.1, 0.25), line(0.35, 0.5)] }]);
  });

  it("trims a run the new mark overlaps at one end", () => {
    const kept = clearHighlightRects([{ rects: [line(0.1, 0.5)] }], [line(0.4, 0.8)]);
    expect(kept).toEqual([{ rects: [line(0.1, 0.4)] }]);
  });

  it("drops a highlight the new mark covers entirely", () => {
    expect(clearHighlightRects([{ rects: [line(0.2, 0.4)] }], [line(0.1, 0.5)])).toEqual([]);
  });

  it("leaves the other lines of the same highlight alone", () => {
    const kept = clearHighlightRects(
      [{ rects: [line(0.1, 0.5), below(0.1, 0.5)] }],
      [line(0.1, 0.5)],
    );
    expect(kept).toEqual([{ rects: [below(0.1, 0.5)] }]);
  });

  it("keeps a run the new mark only passes over on another line", () => {
    const highlight = { rects: [line(0.1, 0.5)] };
    expect(clearHighlightRects([highlight], [below(0.1, 0.5)])).toEqual([highlight]);
  });

  it("throws away a sliver left behind by the mark's own padding", () => {
    expect(clearHighlightRects([{ rects: [line(0.1, 0.502)] }], [line(0.1, 0.5)])).toEqual([]);
  });
});
