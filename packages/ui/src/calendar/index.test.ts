import { describe, expect, test } from "vitest";

import { addDays, buildMonthGrid, formatCalendarDate, monthOf, shiftMonth } from "./index";

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

describe("addDays", () => {
  test("rolls over month and year boundaries in both directions", () => {
    expect(addDays("2026-10-13", 1)).toBe("2026-10-14");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-10-13", 0)).toBe("2026-10-13");
  });

  test("handles February in both a leap and a non-leap year", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  test("crosses a DST transition without skipping or repeating a day", () => {
    // Europe/Bucharest springs forward on 29 March 2026 and falls back on
    // 25 October. These add whole UTC days, so neither can shift the result.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  test("spans a fortnight, the admin console's planning window", () => {
    const window = Array.from({ length: 15 }, (_, index) => addDays("2026-10-13", index));

    expect(window).toHaveLength(15);
    expect(window.at(-1)).toBe("2026-10-27");
    expect(new Set(window).size).toBe(15);
  });

  test("rejects anything that is not a calendar date", () => {
    expect(() => addDays("2026-10", 1)).toThrow();
    expect(() => addDays("2026-10-13T00:00:00Z", 1)).toThrow();
  });
});

describe("MonthGrid.range", () => {
  test("covers every cell the grid renders, not just the month", () => {
    // The bug this replaces: fetching the month's own first-to-last left the
    // padding cells matching no row, so a day answered on 29 September was
    // inert and unmarked in October's grid but marked in September's.
    for (const month of ["2026-10", "2026-11", "2024-02", "2026-02"]) {
      const grid = buildMonthGrid(month, { today: TODAY });
      const cells = grid.weeks.flat().map((day) => day.date);

      expect(grid.range.start).toBe(cells[0]);
      expect(grid.range.end).toBe(cells.at(-1));
      // Nothing rendered falls outside the range — the property that matters,
      // stated without restating the arithmetic.
      expect(cells.every((date) => date >= grid.range.start && date <= grid.range.end)).toBe(true);
    }
  });

  test("reaches into both neighbouring months when the padding does", () => {
    const grid = buildMonthGrid("2026-10", { today: TODAY });

    expect(grid.range.start).toBe("2026-09-28");
    expect(grid.range.end).toBe("2026-11-08");
  });

  test("stays within the server's 92-day calendar span limit", () => {
    // Six weeks is 42 days, so a grid is always fetchable in one request.
    const grid = buildMonthGrid("2026-10", { today: TODAY });
    const days =
      (Date.parse(`${grid.range.end}T00:00:00Z`) - Date.parse(`${grid.range.start}T00:00:00Z`)) /
      86_400_000;

    expect(days).toBe(41);
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
