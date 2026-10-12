import { describe, expect, test } from "vitest";

import { formatMonthYear, formatPostDate } from "./date";

// These assertions depend on the runner's zone, because both formatters
// deliberately render in it -- a byline should read in the viewer's own local
// time. The package's test script therefore pins TZ=UTC; without that this
// file was genuinely red east of about UTC+3, since "2026-08-31T21:09:52Z"
// is already September there. Fixtures also sit at midday so a stray `vitest`
// run outside the script stays green nearly everywhere.
const MIDDAY_AUGUST = "2026-08-31T12:00:00Z";
const MIDDAY_OCTOBER = "2026-10-09T12:00:00Z";

describe("formatMonthYear", () => {
  test("renders the month and year", () => {
    expect(formatMonthYear(MIDDAY_AUGUST)).toBe("August 2026");
  });

  test("uses the en-US month name rather than the host locale's", () => {
    expect(formatMonthYear(MIDDAY_OCTOBER)).toBe("October 2026");
  });
});

describe("formatPostDate", () => {
  test("renders the day and the time", () => {
    // Day precision plus a time, unlike formatMonthYear: several
    // announcements can land on the same day, and "which came first" is what
    // a reader wants from the byline.
    expect(formatPostDate(MIDDAY_OCTOBER)).toBe("Oct 9, 2026 at 12:00 PM");
  });

  test("does not follow the host locale", () => {
    // en-US ordering and a 12-hour clock, not 05/01/2026 or 12:00.
    expect(formatPostDate("2026-01-05T12:00:00Z")).toBe("Jan 5, 2026 at 12:00 PM");
  });

  test("renders in the viewer's zone, which is why the script pins one", () => {
    // Documents the intent rather than asserting an offset: with TZ=UTC an
    // instant 10 minutes before midnight UTC stays on the 31st. Under UTC+3
    // it would correctly read as the 1st -- right for a reader there, and the
    // reason an unpinned exact assertion is a trap.
    expect(formatPostDate("2026-08-31T23:50:00Z")).toBe("Aug 31, 2026 at 11:50 PM");
  });
});
