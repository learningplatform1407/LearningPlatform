import { describe, expect, test } from "vitest";

import { clozeGap } from "./cloze";

describe("clozeGap", () => {
  test("hints off: the plain placeholder, whitespace kept outside", () => {
    expect(clozeGap("Efficient ", false)).toEqual({ lead: "", label: "[ … ]", trail: " " });
    expect(clozeGap(" gas", false)).toEqual({ lead: " ", label: "[ … ]", trail: "" });
  });

  test("hints on: first letter and one mark per remaining letter, per word", () => {
    expect(clozeGap("mitochondria", true).label).toBe("[ m___________ ]");
    expect(clozeGap("dead space", true).label).toBe("[ d___ s____ ]");
    expect(clozeGap("a", true).label).toBe("[ a ]");
  });

  test("never contains the hidden word past its first letter", () => {
    const { label } = clozeGap("ventilation", true);
    expect(label).not.toContain("entilation");
  });

  test("very long words cap their marks", () => {
    expect(clozeGap("pneumonoultramicroscopic", true).label).toBe("[ p____________ ]");
  });
});
