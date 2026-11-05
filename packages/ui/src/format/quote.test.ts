import { describe, expect, test } from "vitest";

import { findQuote } from "./quote";

describe("findQuote", () => {
  test("finds a passage, matching whitespace loosely", () => {
    const text = "Nitrates cause venodilation.\nThis lowers preload.";
    expect(findQuote(text, "venodilation. This lowers")).toEqual({ start: 15, end: 40 });
  });

  test("treats regex characters in the quote literally", () => {
    expect(findQuote("Dose (mg/kg) is 0.5.", "(mg/kg) is 0.5")).toEqual({ start: 5, end: 19 });
  });

  test("null when the passage is not there, or the quote is blank", () => {
    expect(findQuote("Hello world", "goodbye")).toBeNull();
    expect(findQuote("Hello world", "   ")).toBeNull();
  });
});
