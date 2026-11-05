import { describe, expect, test } from "vitest";

import { sentenceAround } from "./sentence";

describe("sentenceAround", () => {
  const text = "Bones heal slowly. The femur is the longest bone. Rest helps.";

  test("the sentence holding the range, punctuation included", () => {
    const { start, end } = sentenceAround(text, 23, 28);
    expect(text.slice(start, end)).toBe("The femur is the longest bone.");
  });

  test("the first and the last sentence run to the text's edges", () => {
    expect(text.slice(...Object.values(sentenceAround(text, 0, 5)))).toBe("Bones heal slowly.");
    const last = sentenceAround(text, 51, 55);
    expect(text.slice(last.start, last.end)).toBe("Rest helps.");
  });
});
