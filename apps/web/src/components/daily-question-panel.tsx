"use client";

import type { DailyQuestion, DailyQuestionDay } from "@lp/api-client";
import { WEEKDAY_LABELS, buildMonthGrid, formatCalendarDate, monthOf, shiftMonth } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/card";
import { OUTCOME_MARKS } from "@/components/question-reveal";
import { getBrowserApiClient } from "@/lib/api-client.browser";

/** One line describing today, shared by the rail and the nav card. */
function summarise(today: DailyQuestion): string {
  if (today.attempt) {
    const mark = OUTCOME_MARKS[today.attempt.outcome];
    return `${mark.label}, ${today.attempt.points_awarded}/${today.attempt.points_possible} points.`;
  }
  if (today.question === null) return "No question today.";
  if (today.answerable) return "Answer today's question.";
  // Drawn, then withdrawn before anyone answered it. Rare, but saying so beats
  // a blank line.
  return "Today's question is unavailable.";
}

function dayLabel(date: string, row: DailyQuestionDay | undefined, isToday: boolean): string {
  const when = isToday ? `Today, ${formatCalendarDate(date)}` : formatCalendarDate(date);
  if (row?.answered && row.outcome) return `${when}: ${OUTCOME_MARKS[row.outcome].label}`;
  return `${when}: not answered`;
}

/** The calendar rail: a month of days, each openable if it has a question.
 *
 * Every date decision here comes from `server_today` by way of
 * `buildMonthGrid`. The device is never asked what day it is, because a phone
 * in another timezone -- or simply set wrong -- would disagree with the
 * institution day about which question is current.
 */
export function DailyQuestionRail({
  today,
  onOpenDay,
}: {
  today: DailyQuestion;
  onOpenDay: (forDate: string) => void;
}) {
  const serverToday = today.server_today;
  const currentMonth = monthOf(serverToday);
  const [month, setMonth] = useState(currentMonth);

  // Built before the query, because the grid is what decides the range to
  // fetch: it renders six weeks, so it reaches into both neighbouring months,
  // and asking only for this month's own days would leave those padding cells
  // matching no row -- inert and unmarked even for a day you answered. The
  // server clamps `end` to its own today, so a range running into next month
  // is safe.
  const grid = buildMonthGrid(month, { today: serverToday });

  const calendar = useQuery({
    queryKey: ["daily-question", "calendar", month],
    queryFn: () => getBrowserApiClient().getDailyQuestionCalendar(grid.range),
  });
  const rows = new Map((calendar.data?.days ?? []).map((day) => [day.for_date, day]));

  return (
    <div className="flex w-full flex-col">
      <h2 className="text-sm font-semibold text-foreground">Question of the day</h2>
      <p className="mt-xs text-xs text-muted-foreground">{summarise(today)}</p>

      <div className="mt-md flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="rounded-md px-sm py-xs text-sm text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <span aria-hidden="true">«</span>
        </button>
        <span className="text-xs font-medium text-foreground">{grid.label}</span>
        <button
          type="button"
          aria-label="Next month"
          // Nothing exists past the current month: future days are never drawn
          // for a learner, so paging forward would only show an empty grid.
          disabled={month >= currentMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="rounded-md px-sm py-xs text-sm text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-40"
        >
          <span aria-hidden="true">»</span>
        </button>
      </div>

      <div className="mt-md grid grid-cols-7 gap-xs" role="presentation">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-center text-xs text-muted-foreground">
            {label.slice(0, 1)}
          </span>
        ))}
      </div>

      <div className="mt-xs grid grid-cols-7 gap-xs">
        {grid.weeks.flat().map((cell) => {
          const row = rows.get(cell.date);
          // Openable only where there is something to open. A past day with no
          // row never had a question -- days are drawn on demand and never
          // backfilled -- so asking for it would 404. Today is always openable,
          // because opening it is what draws it.
          const openable = cell.isToday || row !== undefined;
          const mark = row?.answered && row.outcome ? OUTCOME_MARKS[row.outcome] : null;

          if (!openable) {
            return (
              <span
                key={cell.date}
                aria-hidden="true"
                className={`rounded-md py-xs text-center text-xs ${
                  cell.inMonth ? "text-muted-foreground" : "text-muted-foreground/40"
                }`}
              >
                {cell.dayOfMonth}
              </span>
            );
          }

          return (
            <button
              key={cell.date}
              type="button"
              aria-label={dayLabel(cell.date, row, cell.isToday)}
              onClick={() => onOpenDay(cell.date)}
              className={`rounded-md py-xs text-center text-xs hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                cell.isToday ? "border border-primary/50 font-semibold" : ""
              } ${mark ? mark.className : "text-foreground"} ${cell.inMonth ? "" : "opacity-50"}`}
            >
              {cell.dayOfMonth}
              {mark && (
                <span aria-hidden="true" className="block leading-none">
                  {mark.icon}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {calendar.isError && (
        <p role="alert" className="mt-sm text-xs text-danger">
          Failed to load the calendar.
        </p>
      )}
    </div>
  );
}

/** The narrow-width entry point: a sixth card in the Learn nav grid.
 *
 * `lg:hidden` lives here rather than at the call site so the card and the rail
 * can never both be on screen. They open the same single overlay, and two
 * triggers for it would read as two different things.
 */
export function DailyQuestionCard({ today, onOpen }: { today: DailyQuestion; onOpen: () => void }) {
  return (
    <Card
      as="button"
      type="button"
      interactive
      onClick={onOpen}
      className="block p-lg text-left lg:hidden"
    >
      <p className="text-lg font-semibold text-foreground">Question of the day</p>
      <p className="mt-xs text-sm text-muted-foreground">{summarise(today)}</p>
    </Card>
  );
}
