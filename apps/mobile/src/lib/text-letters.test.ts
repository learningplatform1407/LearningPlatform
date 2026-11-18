import { letterAtPoint, type TextLine } from "./text-letters";

// "Hello world " wraps after the space; "again" is the second line. Each
// line is 20 tall; the widths are what RN would measure.
const LINES: TextLine[] = [
  { text: "Hello world ", x: 0, y: 0, width: 100, height: 20 },
  { text: "again", x: 0, y: 20, width: 45, height: 20 },
];

test("the ends of a line are exact: its first and last letters", () => {
  expect(letterAtPoint(LINES, 0.5, 10)).toEqual({ start: 0, end: 1 }); // "H"
  expect(letterAtPoint(LINES, 99.5, 10)).toEqual({ start: 10, end: 11 }); // "d"
});

test("a point past the end of a line, or on its wrapping space, is its last letter", () => {
  expect(letterAtPoint(LINES, 140, 10)).toEqual({ start: 10, end: 11 });
});

test("the second line's letters are offset by the first line's text", () => {
  expect(letterAtPoint(LINES, 1, 30)).toEqual({ start: 12, end: 13 }); // "a" of "again"
});

test("a point between lines, or above or below them all, counts for the nearer line", () => {
  expect(letterAtPoint(LINES, 1, -15)).toEqual({ start: 0, end: 1 });
  expect(letterAtPoint(LINES, 1, 90)).toEqual({ start: 12, end: 13 });
});

test("narrow letters take less of the line than wide ones", () => {
  // "ill" then "WWW" across 100: the Ws are far wider, so 30% of the way in
  // is already past the narrow letters.
  const lines = [{ text: "illWWW", x: 0, y: 0, width: 100, height: 20 }];
  expect(letterAtPoint(lines, 30, 10)).toEqual({ start: 3, end: 4 });
});

test("a point on a space inside a line is the nearer letter beside it", () => {
  const lines = [{ text: "a b", x: 0, y: 0, width: 30, height: 20 }];
  const hit = letterAtPoint(lines, 15, 10)!;
  expect([0, 2]).toContain(hit.start);
});

test("no lines, or a paragraph of spaces, has no letter", () => {
  expect(letterAtPoint([], 0, 0)).toBeNull();
  expect(letterAtPoint([{ text: "   ", x: 0, y: 0, width: 0, height: 20 }], 0, 0)).toBeNull();
});
