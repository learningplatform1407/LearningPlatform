import type { Annotation } from "@lp/contracts";
import { describe, expect, test } from "vitest";

import {
  findBlockElement,
  getOffsetsWithinContainer,
  spliceAnnotations,
  spliceClozeSpans,
} from "./text-offset";

function highlight(overrides: Partial<Annotation>): Annotation {
  return {
    id: "a1",
    document_version_id: "v1",
    type: "highlight",
    block_index: 0,
    start_offset: null,
    end_offset: null,
    note_text: null,
    color: "yellow",
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("getOffsetsWithinContainer", () => {
  test("computes offsets within a single text node", () => {
    document.body.innerHTML = '<p data-block-index="0">Hello world</p>';
    const p = document.querySelector("p")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, 5);

    expect(getOffsetsWithinContainer(p, range)).toEqual({ start: 0, end: 5 });
  });

  test("computes offsets across multiple text nodes (e.g. an existing highlight span)", () => {
    document.body.innerHTML = '<p data-block-index="0">Hello <span>world</span>!</p>';
    const p = document.querySelector("p")!;
    const span = p.querySelector("span")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(span.firstChild!, 5);

    expect(getOffsetsWithinContainer(p, range)).toEqual({ start: 0, end: 11 });
  });

  test("returns null when the range lies outside the given container", () => {
    document.body.innerHTML = '<p data-block-index="0">Hello</p><p data-block-index="1">World</p>';
    const [p0, p1] = [...document.querySelectorAll("p")] as [
      HTMLParagraphElement,
      HTMLParagraphElement,
    ];
    const range = document.createRange();
    range.setStart(p1.firstChild!, 0);
    range.setEnd(p1.firstChild!, 5);

    expect(getOffsetsWithinContainer(p0, range)).toBeNull();
  });
});

describe("findBlockElement", () => {
  test("finds the nearest ancestor carrying data-block-index from a nested text node", () => {
    document.body.innerHTML = '<p data-block-index="2">Hello <span>world</span></p>';
    const span = document.querySelector("span")!;

    const block = findBlockElement(span.firstChild!);
    expect(block?.getAttribute("data-block-index")).toBe("2");
  });

  test("returns null when there is no enclosing block", () => {
    document.body.innerHTML = "<p>No block index here</p>";
    const p = document.querySelector("p")!;
    expect(findBlockElement(p.firstChild!)).toBeNull();
  });
});

describe("spliceAnnotations", () => {
  test("splits text into a plain run and a highlighted run", () => {
    const segments = spliceAnnotations("Hello world", [
      highlight({ id: "a1", start_offset: 6, end_offset: 11 }),
    ]);

    expect(segments).toEqual([
      { text: "Hello ", annotation: null },
      { text: "world", annotation: expect.objectContaining({ id: "a1" }) },
    ]);
  });

  test("returns the whole text as one plain segment when there are no range-anchored annotations", () => {
    const segments = spliceAnnotations("Hello world", [
      highlight({ id: "a1", type: "margin_note", start_offset: null, end_offset: null }),
    ]);

    expect(segments).toEqual([{ text: "Hello world", annotation: null }]);
  });

  test("handles multiple non-overlapping highlights out of order", () => {
    const segments = spliceAnnotations("abcdefghij", [
      highlight({ id: "a2", start_offset: 6, end_offset: 9 }),
      highlight({ id: "a1", start_offset: 0, end_offset: 3 }),
    ]);

    expect(segments.map((s) => s.text)).toEqual(["abc", "def", "ghi", "j"]);
    expect(segments[0]?.annotation?.id).toBe("a1");
    expect(segments[2]?.annotation?.id).toBe("a2");
  });

  test("returns an empty-text plain segment for an empty block", () => {
    expect(spliceAnnotations("", [])).toEqual([{ text: "", annotation: null }]);
  });

  test("overlapping highlights do not duplicate the shared text", () => {
    // "abcdefghij" — a1 covers "abcdef" (0-6), a2 covers "defghi" (3-9, created later).
    const segments = spliceAnnotations("abcdefghij", [
      highlight({ id: "a1", start_offset: 0, end_offset: 6, created_at: "2026-01-01T00:00:00Z" }),
      highlight({ id: "a2", start_offset: 3, end_offset: 9, created_at: "2026-01-02T00:00:00Z" }),
    ]);

    // Every character appears exactly once across all segments — no duplication.
    expect(segments.map((s) => s.text).join("")).toBe("abcdefghij");
    expect(segments.map((s) => s.text)).toEqual(["abc", "def", "ghi", "j"]);
  });

  test("the most recently created annotation wins the visual in an overlapping region", () => {
    const segments = spliceAnnotations("abcdefghij", [
      highlight({
        id: "older",
        start_offset: 0,
        end_offset: 6,
        created_at: "2026-01-01T00:00:00Z",
      }),
      highlight({
        id: "newer",
        start_offset: 3,
        end_offset: 9,
        created_at: "2026-01-02T00:00:00Z",
      }),
    ]);

    const overlap = segments.find((s) => s.text === "def");
    expect(overlap?.annotation?.id).toBe("newer");
    const olderOnly = segments.find((s) => s.text === "abc");
    expect(olderOnly?.annotation?.id).toBe("older");
    const newerOnly = segments.find((s) => s.text === "ghi");
    expect(newerOnly?.annotation?.id).toBe("newer");
  });

  test("a highlight fully inside another still renders every character once", () => {
    // a1 covers the whole word "abcdefghij", a2 (created later) covers just "def" inside it.
    const segments = spliceAnnotations("abcdefghij", [
      highlight({ id: "a1", start_offset: 0, end_offset: 10, created_at: "2026-01-01T00:00:00Z" }),
      highlight({ id: "a2", start_offset: 3, end_offset: 6, created_at: "2026-01-02T00:00:00Z" }),
    ]);

    expect(segments.map((s) => s.text).join("")).toBe("abcdefghij");
    expect(segments.map((s) => s.text)).toEqual(["abc", "def", "ghij"]);
    expect(segments.find((s) => s.text === "def")?.annotation?.id).toBe("a2");
    expect(segments.find((s) => s.text === "abc")?.annotation?.id).toBe("a1");
    expect(segments.find((s) => s.text === "ghij")?.annotation?.id).toBe("a1");
  });
});

describe("spliceClozeSpans", () => {
  test("passes text through unchanged when there are no spans", () => {
    expect(spliceClozeSpans("Nothing hidden here.", [])).toEqual([
      { text: "Nothing hidden here.", hidden: false, id: null },
    ]);
  });

  test("hides a span's text when marked hidden", () => {
    const segments = spliceClozeSpans("The mitochondria produces energy.", [
      { id: "c1", start_offset: 4, end_offset: 16, hidden: true },
    ]);
    expect(segments).toEqual([
      { text: "The ", hidden: false, id: null },
      { text: "", hidden: true, id: "c1" },
      { text: " produces energy.", hidden: false, id: null },
    ]);
  });

  test("reveals a span's real text when marked not hidden, tagged with its id", () => {
    const segments = spliceClozeSpans("The mitochondria produces energy.", [
      { id: "c1", start_offset: 4, end_offset: 16, hidden: false },
    ]);
    expect(segments).toEqual([
      { text: "The ", hidden: false, id: null },
      { text: "mitochondria", hidden: false, id: "c1" },
      { text: " produces energy.", hidden: false, id: null },
    ]);
  });

  test("renders multiple spans in the same block independently — one hidden, one revealed", () => {
    // Matches what's actually happened live: two due cards in one sentence.
    const segments = spliceClozeSpans("The database index accelerates lookups.", [
      { id: "c1", start_offset: 4, end_offset: 12, hidden: false }, // "database" -- already graded
      { id: "c2", start_offset: 13, end_offset: 18, hidden: true }, // "index" -- still queued
    ]);
    expect(segments).toEqual([
      { text: "The ", hidden: false, id: null },
      { text: "database", hidden: false, id: "c1" },
      { text: " ", hidden: false, id: null },
      { text: "", hidden: true, id: "c2" },
      { text: " accelerates lookups.", hidden: false, id: null },
    ]);
  });

  test("omits the before segment when a span starts at offset 0", () => {
    const segments = spliceClozeSpans("Energy flows.", [
      { id: "c1", start_offset: 0, end_offset: 6, hidden: true },
    ]);
    expect(segments).toEqual([
      { text: "", hidden: true, id: "c1" },
      { text: " flows.", hidden: false, id: null },
    ]);
  });

  test("omits the after segment when a span reaches the end of the text", () => {
    const segments = spliceClozeSpans("It flows fast", [
      { id: "c1", start_offset: 9, end_offset: 13, hidden: false },
    ]);
    expect(segments).toEqual([
      { text: "It flows ", hidden: false, id: null },
      { text: "fast", hidden: false, id: "c1" },
    ]);
  });

  test("clamps an out-of-range span to the text's bounds", () => {
    const segments = spliceClozeSpans("Short", [
      { id: "c1", start_offset: 2, end_offset: 999, hidden: true },
    ]);
    expect(segments).toEqual([
      { text: "Sh", hidden: false, id: null },
      { text: "", hidden: true, id: "c1" },
    ]);
  });
});
