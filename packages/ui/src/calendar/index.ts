/** Month-grid arithmetic for the question-of-the-day calendar.
 *
 * `@lp/ui` is the only package both apps import at runtime, which makes it
 * the available home -- the same reasoning `src/feed/index.ts` records. Its
 * test script also pins `TZ=UTC`, which day maths wants.
 *
 * Everything here speaks `YYYY-MM-DD` strings and never hands a `Date` across
 * its boundary. That is not fussiness: `new Date("2026-10-12")` parses as
 * **UTC** midnight while `new Date(2026, 9, 12)` is **local** midnight, and
 * mixing the two is the classic off-by-one that renders the 1st of a month in
 * the previous month's last cell. Staying in string space and doing the
 * arithmetic with `Date.UTC` makes the grid byte-identical in every timezone,
 * so the pinned TZ is belt-and-braces rather than load-bearing.
 *
 * `today` is always a parameter, fed from the server's `server_today`. The
 * grid never asks the device what day it is, because a device in another
 * timezone -- or simply set wrong -- would disagree with the institution day
 * about which question is current.
 */

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MS_PER_DAY = 86_400_000;

/** Monday-first, matching European convention. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface CalendarDay {
  /** "2026-10-12" — the key into the API's per-date rows. */
  date: string;
  dayOfMonth: number;
  /** False for the leading and trailing days padding the grid to whole weeks. */
  inMonth: boolean;
  isToday: boolean;
  /** Strictly after `today`; these have no question to show yet. */
  isFuture: boolean;
}

export interface MonthGrid {
  /** "2026-10" */
  month: string;
  /** "October 2026" */
  label: string;
  weeks: CalendarDay[][];
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Expected a YYYY-MM month, got "${month}"`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error(`Invalid month "${month}"`);
  return { year, monthIndex };
}

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** The month containing an ISO date, as "YYYY-MM". */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** "2026-10" + 1 → "2026-11"; -1 → "2026-09". Rolls the year correctly. */
export function shiftMonth(month: string, delta: number): string {
  const { year, monthIndex } = parseMonth(month);
  // Date.UTC normalises an out-of-range month into the right year, so
  // December + 1 and January - 1 need no special case.
  return new Date(Date.UTC(year, monthIndex + delta, 1)).toISOString().slice(0, 7);
}

/** The first and last day of a month, for the calendar API's query bounds. */
export function monthRange(month: string): { start: string; end: string } {
  const { year, monthIndex } = parseMonth(month);
  return {
    start: isoDate(Date.UTC(year, monthIndex, 1)),
    // Day 0 of the next month is the last day of this one, which handles
    // 28/29/30/31 without a lookup table.
    end: isoDate(Date.UTC(year, monthIndex + 1, 0)),
  };
}

/** A six-week, Monday-first grid covering `month`, padded with neighbours.
 *
 * Always six rows, so the calendar does not change height as someone pages
 * through months -- a five-row February followed by a six-row March would
 * otherwise make the surrounding layout jump.
 */
export function buildMonthGrid(month: string, options: { today: string }): MonthGrid {
  const { year, monthIndex } = parseMonth(month);
  const firstOfMonth = Date.UTC(year, monthIndex, 1);

  // getUTCDay is 0=Sunday; shift so Monday is 0.
  const leadingDays = (new Date(firstOfMonth).getUTCDay() + 6) % 7;
  const gridStart = Date.UTC(year, monthIndex, 1 - leadingDays);

  const weeks: CalendarDay[][] = [];
  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const cursor = new Date(gridStart + (week * 7 + weekday) * MS_PER_DAY);
      const date = cursor.toISOString().slice(0, 10);
      days.push({
        date,
        dayOfMonth: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === monthIndex && cursor.getUTCFullYear() === year,
        isToday: date === options.today,
        // String comparison is exact for ISO dates, which is half the reason
        // this module stays in string space.
        isFuture: date > options.today,
      });
    }
    weeks.push(days);
  }

  return { month, label: MONTH_LABEL.format(new Date(firstOfMonth)), weeks };
}
