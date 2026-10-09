import { describe, expect, test } from "vitest";

import { formatMonthYear, formatPostDate } from "./date";

describe("formatMonthYear", () => {
  test("renders the month and year", () => {
    expect(formatMonthYear("2026-08-31T21:09:52Z")).toBe("August 2026");
  });
});

describe("formatPostDate", () => {
  test("renders the day and the time", () => {
    // Two announcements can land on the same day, so the byline carries a
    // time as well -- that is the difference from formatMonthYear. The hour
    // is matched loosely because it renders in the runner's time zone.
    expect(formatPostDate("2026-10-09T13:16:00Z")).toMatch(
      /^Oct \d{1,2}, 2026 at \d{1,2}:\d{2}\s?[AP]M$/,
    );
  });

  test("does not follow the host locale", () => {
    // The locale is pinned, so a US-style "Jan 5, 2026" holds on any runner.
    // Without that, the same post reads differently per device and this test
    // would pass or fail depending on configuration.
    expect(formatPostDate("2026-01-05T12:00:00Z")).toContain("Jan 5, 2026");
  });
});
