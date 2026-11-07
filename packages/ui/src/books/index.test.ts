import { describe, expect, it } from "vitest";

import { BOOK_COVER_COLORS, coverColorForTitle } from "./index";

describe("coverColorForTitle", () => {
  it("gives the same book the same cover every time", () => {
    expect(coverColorForTitle("Anatomy")).toBe(coverColorForTitle("Anatomy"));
  });

  it("always picks from the palette", () => {
    for (const title of ["", "A", "Orthopaedics", "Ünïcødé"]) {
      expect(BOOK_COVER_COLORS).toContain(coverColorForTitle(title));
    }
  });
});
