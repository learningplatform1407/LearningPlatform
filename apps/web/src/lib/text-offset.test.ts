import type { Annotation } from "@lp/contracts";
import { describe, expect, test } from "vitest";

import { findBlockElement, getOffsetsWithinContainer, spliceAnnotations } from "./text-offset";

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
    document.body.innerHTML =
      '<p data-block-index="0">Hello</p><p data-block-index="1">World</p>';
    const [p0, p1] = [...document.querySelectorAll("p")] as [HTMLParagraphElement, HTMLParagraphElement];
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
});
