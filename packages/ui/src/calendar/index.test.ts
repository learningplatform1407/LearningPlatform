import { describe, expect, test } from "vitest";

import { buildMonthGrid, formatCalendarDate, monthOf, monthRange, shiftMonth } from "./index";

// Worth knowing what these do and do not prove. This package's test script
// pins `TZ=UTC`, so they are deterministic -- but that pin also means they
// would *not* catch a regression from `Date.UTC(...)` to
// `new Date(y, m, d)` local-midnight arithmetic. That was checked separately
// by running `vitest` directly under several zones: the current
// implementation passes in all of them, and the local-midnight version fails
// in Europe/Bucharest while still passing in America/Los_Angeles, because
// only zones east of UTC shift an ISO date backwards across midnight. So a
// west-of-UTC developer could introduce that bug and see green.
const TODAY = "2026-10-13";

describe("buildMonthGrid", () => {
  test("is always six Monday-first weeks", () => {
    const grid = buildMonthGrid("2026-10", { today: TODAY });

    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.label).toBe("October 2026");
    // 1 October 2026 is a Thursday, so the row starts on Monday 28 September.
    expect(grid.weeks[0]![0]!.date).toBe("2026-09-28");
    expect(grid.weeks[0]![0]!.inMonth).toBe(false);
    expect(grid.weeks[0]![3]!.date).toBe("2026-10-01");
    expect(grid.weeks[0]![3]!.inMonth).toBe(true);
  });

  test("pads the trailing week with the next month", () => {
    const grid = buildMonthGrid("2026-10", { today: TODAY });
    const last = grid.weeks[5]![6]!;

    expect(last.inMonth).toBe(false);
    expect(last.date > "2026-10-31").toBe(true);
  });

  test("marks today and the future from the injected date, not the clock", () => {
    const grid = buildMonthGrid("2026-10", { today: TODAY });
    const days = grid.weeks.flat();

    expect(days.filter((day) => day.isToday)).toHaveLength(1);
    expect(days.find((day) => day.date === TODAY)!.isToday).toBe(true);
    expect(days.find((day) => day.date === "2026-10-12")!.isFuture).toBe(false);
    expect(days.find((day) => day.date === "2026-10-14")!.isFuture).toBe(true);
  });

  test("a month the injected today is not in has no today cell", () => {
    const grid = buildMonthGrid("2026-09", { today: TODAY });

    expect(grid.weeks.flat().some((day) => day.isToday)).toBe(false);
  });

  test("handles a leap February", () => {
    const inMonth = buildMonthGrid("2024-02", { today: TODAY })
      .weeks.flat()
      .filter((day) => day.inMonth);

    expect(inMonth).toHaveLength(29);
    expect(inMonth.at(-1)!.date).toBe("2024-02-29");
  });

  test("handles a non-leap February", () => {
    const inMonth = buildMonthGrid("2026-02", { today: TODAY })
      .weeks.flat()
      .filter((day) => day.inMonth);

    expect(inMonth).toHaveLength(28);
  });

  test("a DST-transition month is unaffected", () => {
    // Europe/Bucharest springs forward on 29 March 2026. A grid built with
    // local-midnight arithmetic would skip or duplicate a day here; this one
    // is pure UTC string maths, so it cannot.
    const inMonth = buildMonthGrid("2026-03", { today: TODAY })
      .weeks.flat()
      .filter((day) => day.inMonth)
      .map((day) => day.date);

    expect(inMonth).toHaveLength(31);
    expect(inMonth).toContain("2026-03-29");
    expect(new Set(inMonth).size).toBe(31);
  });

  test("rejects a malformed month rather than rendering nonsense", () => {
    expect(() => buildMonthGrid("2026-13", { today: TODAY })).toThrow();
    expect(() => buildMonthGrid("October", { today: TODAY })).toThrow();
  });
});

describe("shiftMonth", () => {
  test("moves within a year", () => {
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
  });

  test("rolls across a year boundary in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthRange", () => {
  test("spans the whole month, whatever its length", () => {
    expect(monthRange("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthRange("2026-11")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(monthRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("monthOf", () => {
  test("extracts the month from an ISO date", () => {
    expect(monthOf("2026-10-13")).toBe("2026-10");
  });
});

describe("formatCalendarDate", () => {
  test("names the day without shifting it", () => {
    expect(formatCalendarDate("2026-10-13")).toBe("Tuesday, October 13, 2026");
    // The two dates most likely to shift under a non-UTC formatter: the first
    // of a month (would print the previous month) and the first of a year.
    expect(formatCalendarDate("2026-10-01")).toBe("Thursday, October 1, 2026");
    expect(formatCalendarDate("2026-01-01")).toBe("Thursday, January 1, 2026");
  });

  test("rejects anything that is not a calendar date", () => {
    // An instant would format fine and silently render in whichever zone the
    // host is in, so it has to be refused rather than accepted.
    expect(() => formatCalendarDate("2026-10-13T22:00:00Z")).toThrow();
    expect(() => formatCalendarDate("2026-10")).toThrow();
  });
});
