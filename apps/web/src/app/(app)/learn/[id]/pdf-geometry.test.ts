import { describe, expect, test } from "vitest";

import {
  highlightHit,
  rectsForRange,
  strokeHit,
  strokePath,
  wordAt,
  wordsForQuote,
  wordsFromTextItems,
} from "./pdf-geometry";

// A 600x800 page with two lines of 10px text: "Hello brave" at y=100 and
// "world" at y=120 (baselines), each character 10px wide.
const ITEMS = [
  { str: "Hello brave", transform: [10, 0, 0, 10, 50, 100], width: 110 },
  { str: "world", transform: [10, 0, 0, 10, 50, 120], width: 50 },
];

describe("wordsFromTextItems", () => {
  test("splits runs into words in reading order, in page units", () => {
    const words = wordsFromTextItems(ITEMS, 600, 800);
    expect(words).toHaveLength(3);
    expect(words.map((w) => w.index)).toEqual([0, 1, 2]);
    const [hello, brave] = words;
    expect(hello!.x0).toBeCloseTo(50 / 600);
    expect(hello!.x1).toBeCloseTo(100 / 600);
    expect(brave!.x0).toBeCloseTo(110 / 600);
    expect(hello!.y0).toBeCloseTo(90 / 800);
    expect(hello!.y1).toBeCloseTo(100 / 800);
  });

  test("skips blank runs", () => {
    expect(
      wordsFromTextItems([{ str: "  ", transform: [10, 0, 0, 10, 0, 0], width: 20 }], 1, 1),
    ).toEqual([]);
  });
});

describe("wordAt", () => {
  const words = wordsFromTextItems(ITEMS, 600, 800);

  test("finds the word under a point", () => {
    expect(wordAt(words, 120 / 600, 95 / 800)?.index).toBe(1);
  });

  test("snaps to the nearest word within reach, and nothing beyond it", () => {
    expect(wordAt(words, 103 / 600, 95 / 800)?.index).toBe(0);
    expect(wordAt(words, 0.9, 0.9)).toBeNull();
  });
});

describe("rectsForRange", () => {
  const words = wordsFromTextItems(ITEMS, 600, 800);

  test("one rectangle per line, covering the run, inset vertically", () => {
    const rects = rectsForRange(words, 0, 2);
    expect(rects).toHaveLength(2);
    const [x0, y0, x1, y1] = rects[0]!;
    expect(x0).toBeLessThan(50 / 600);
    expect(x1).toBeGreaterThan(160 / 600);
    expect(y0).toBeCloseTo((90 + 1.5) / 800);
    expect(y1).toBeCloseTo((90 + 8.5) / 800);
  });

  test("works in either drag direction", () => {
    expect(rectsForRange(words, 1, 0)).toEqual(rectsForRange(words, 0, 1));
  });
});

describe("hit tests", () => {
  test("a highlight is hit inside its rectangles only", () => {
    const highlight = {
      color: "yellow",
      rects: [[0.1, 0.1, 0.3, 0.12]] as [number, number, number, number][],
    };
    expect(highlightHit(highlight, 0.2, 0.11)).toBe(true);
    expect(highlightHit(highlight, 0.5, 0.11)).toBe(false);
  });

  test("a stroke is hit near any of its segments, not just its points", () => {
    const stroke = {
      color: "#000",
      width: 0.002,
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ],
    };
    expect(strokeHit(stroke, 0.5, 0.501, 0.005, 1)).toBe(true);
    expect(strokeHit(stroke, 0.5, 0.6, 0.005, 1)).toBe(false);
  });
});

describe("strokePath", () => {
  test("smooths through midpoints with quadratic curves", () => {
    const d = strokePath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(d).toBe("M0 0Q1 0 1 0.5L1 1");
  });

  test("a dot is still drawn", () => {
    expect(strokePath([{ x: 0.5, y: 0.5 }])).toContain("l0.01 0");
  });
});

describe("wordsForQuote", () => {
  const words = wordsFromTextItems(ITEMS, 600, 800);

  test("finds a passage across lines, as word indexes", () => {
    expect(wordsForQuote(words, "brave\n world")).toEqual([1, 2]);
    expect(wordsForQuote(words, "Hello")).toEqual([0, 0]);
  });

  test("null when the page doesn't contain it", () => {
    expect(wordsForQuote(words, "goodbye")).toBeNull();
  });
});
