import type { Annotation } from "@lp/contracts";

import { spliceAnnotations, spliceClozeSpans } from "./text-offset";

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

test("overlapping highlights (created on web) do not duplicate the shared text", () => {
  const segments = spliceAnnotations("abcdefghij", [
    highlight({ id: "a1", start_offset: 0, end_offset: 6, created_at: "2026-01-01T00:00:00Z" }),
    highlight({ id: "a2", start_offset: 3, end_offset: 9, created_at: "2026-01-02T00:00:00Z" }),
  ]);

  expect(segments.map((s) => s.text).join("")).toBe("abcdefghij");
  expect(segments.map((s) => s.text)).toEqual(["abc", "def", "ghi", "j"]);
});

test("the most recently created annotation wins the visual in an overlapping region", () => {
  const segments = spliceAnnotations("abcdefghij", [
    highlight({ id: "older", start_offset: 0, end_offset: 6, created_at: "2026-01-01T00:00:00Z" }),
    highlight({ id: "newer", start_offset: 3, end_offset: 9, created_at: "2026-01-02T00:00:00Z" }),
  ]);

  expect(segments.find((s) => s.text === "def")?.annotation?.id).toBe("newer");
  expect(segments.find((s) => s.text === "abc")?.annotation?.id).toBe("older");
  expect(segments.find((s) => s.text === "ghi")?.annotation?.id).toBe("newer");
});

test("spliceClozeSpans passes text through unchanged when there are no spans", () => {
  expect(spliceClozeSpans("Nothing hidden here.", [])).toEqual([
    { text: "Nothing hidden here.", hidden: false, id: null },
  ]);
});

test("spliceClozeSpans hides a span's text when marked hidden", () => {
  const segments = spliceClozeSpans("The mitochondria produces energy.", [
    { id: "c1", start_offset: 4, end_offset: 16, hidden: true },
  ]);

  expect(segments).toEqual([
    { text: "The ", hidden: false, id: null },
    { text: "", hidden: true, id: "c1" },
    { text: " produces energy.", hidden: false, id: null },
  ]);
});

test("spliceClozeSpans reveals a span's real text when marked not hidden, tagged with its id", () => {
  const segments = spliceClozeSpans("The mitochondria produces energy.", [
    { id: "c1", start_offset: 4, end_offset: 16, hidden: false },
  ]);

  expect(segments).toEqual([
    { text: "The ", hidden: false, id: null },
    { text: "mitochondria", hidden: false, id: "c1" },
    { text: " produces energy.", hidden: false, id: null },
  ]);
});

test("spliceClozeSpans renders multiple spans in the same block independently", () => {
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

test("spliceClozeSpans omits the before/after segments at the text's edges", () => {
  expect(
    spliceClozeSpans("Energy flows.", [{ id: "c1", start_offset: 0, end_offset: 6, hidden: true }]),
  ).toEqual([
    { text: "", hidden: true, id: "c1" },
    { text: " flows.", hidden: false, id: null },
  ]);
  expect(
    spliceClozeSpans("It flows fast", [
      { id: "c1", start_offset: 9, end_offset: 13, hidden: false },
    ]),
  ).toEqual([
    { text: "It flows ", hidden: false, id: null },
    { text: "fast", hidden: false, id: "c1" },
  ]);
});

test("spliceClozeSpans clamps an out-of-range span to the text's bounds", () => {
  const segments = spliceClozeSpans("Short", [
    { id: "c1", start_offset: 2, end_offset: 999, hidden: true },
  ]);
  expect(segments).toEqual([
    { text: "Sh", hidden: false, id: null },
    { text: "", hidden: true, id: "c1" },
  ]);
});
