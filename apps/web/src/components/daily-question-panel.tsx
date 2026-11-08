"use client";

import type { DailyQuestion, DailyQuestionDay } from "@lp/api-client";
import {
  buildMonthGrid,
  formatCalendarDate,
  monthOf,
  shiftMonth,
  weekdayLabels,
  type Translator,
} from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/card";
import { OUTCOME_MARKS } from "@/components/question-reveal";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

/** One line describing today, shared by the rail and the nav card. */
function summarise(t: Translator["t"], today: DailyQuestion): string {
  if (today.attempt) {
    return t("daily.summaryAnswered", {
      outcome: t(`questions.answered.${today.attempt.outcome}`),
      awarded: today.attempt.points_awarded,
      possible: today.attempt.points_possible,
    });
  }
  if (today.question === null) return t("daily.noQuestion");
  if (today.answerable) return t("daily.answerToday");
  // Drawn, then withdrawn before anyone answered it. Rare, but saying so beats
  // a blank line.
  return t("daily.unavailable");
}

function dayLabel(
  { t, language }: Translator,
  date: string,
  row: DailyQuestionDay | undefined,
  isToday: boolean,
): string {
  const formatted = formatCalendarDate(date, language);
  const when = isToday ? t("daily.todayWithDate", { date: formatted }) : formatted;
  if (row?.answered && row.outcome) {
    return t("daily.dayOutcome", { when, outcome: t(`questions.answered.${row.outcome}`) });
  }
  return t("daily.dayNotAnswered", { when });
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
  const i18n = useI18n();
  const { t } = i18n;
  const serverToday = today.server_today;
  const currentMonth = monthOf(serverToday);
  const [month, setMonth] = useState(currentMonth);

  // Built before the query, because the grid is what decides the range to
  // fetch: it renders six weeks, so it reaches into both neighbouring months,
  // and asking only for this month's own days would leave those padding cells
  // matching no row -- inert and unmarked even for a day you answered. The
  // server clamps `end` to its own today, so a range running into next month
  // is safe.
  const grid = buildMonthGrid(month, { today: serverToday, language: i18n.language });

  const calendar = useQuery({
    queryKey: ["daily-question", "calendar", month],
    queryFn: () => getBrowserApiClient().getDailyQuestionCalendar(grid.range),
  });
  const rows = new Map((calendar.data?.days ?? []).map((day) => [day.for_date, day]));

  return (
    <div className="flex w-full flex-col">
      <h2 className="label-caps">{t("daily.title")}</h2>
      <p className="mt-xs text-caption font-semibold text-muted-foreground">
        {summarise(t, today)}
      </p>

      <div className="mt-md flex items-center justify-between">
        <button
          type="button"
          aria-label={t("daily.previousMonth")}
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="rounded-md px-sm py-xs text-sm text-muted-foreground hover:bg-muted"
        >
          <span aria-hidden="true">«</span>
        </button>
        <span className="text-xs font-semibold text-foreground">{grid.label}</span>
        <button
          type="button"
          aria-label={t("daily.nextMonth")}
          // Nothing exists past the current month: future days are never drawn
          // for a learner, so paging forward would only show an empty grid.
          disabled={month >= currentMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="rounded-md px-sm py-xs text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <span aria-hidden="true">»</span>
        </button>
      </div>

      <div className="mt-md grid grid-cols-7 gap-xs" role="presentation">
        {weekdayLabels(i18n.language).map((label) => (
          <span
            key={label}
            className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
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
                className={`aspect-square rounded-full py-xs text-center text-xs ${
                  cell.inMonth ? "text-muted-foreground" : "text-muted-foreground font-normal"
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
              aria-label={dayLabel(i18n, cell.date, row, cell.isToday)}
              onClick={() => onOpenDay(cell.date)}
              className={`aspect-square rounded-full py-xs text-center text-xs font-medium hover:bg-muted ${
                cell.isToday
                  ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  : (mark?.className ?? "text-foreground")
              }`}
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
          {t("daily.calendarFailed")}
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
  const { t } = useI18n();
  return (
    <Card
      as="button"
      type="button"
      interactive
      onClick={onOpen}
      className="block px-md py-3.5 text-left lg:hidden"
    >
      <p className="text-card leading-snug font-extrabold text-foreground">{t("daily.title")}</p>
      <p className="mt-xs text-toc leading-snug text-muted-foreground">{summarise(t, today)}</p>
    </Card>
  );
}
