import type { Annotation } from "@lp/contracts";

import { spliceAnnotations } from "./text-offset";

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
