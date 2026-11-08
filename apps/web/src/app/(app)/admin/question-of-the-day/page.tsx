"use client";

import type { DailyQuestionAdminDay } from "@lp/api-client";
import type { Translator } from "@lp/ui";
import { ApiClientError } from "@lp/api-client";
import { addDays, formatCalendarDate } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

function describeError(t: Translator["t"], err: unknown): string {
  if (err instanceof ApiClientError) {
    const body = err.body as { message?: string } | null;
    return body?.message ?? t("questions.requestFailed", { status: err.status });
  }
  return err instanceof Error ? err.message : t("admin.import.somethingWrong");
}

/** A day in the planning window, whether or not it has a row yet. */
interface PlannedDay {
  forDate: string;
  /** `undefined` for a day no question has been drawn for. */
  row: DailyQuestionAdminDay | undefined;
}

function DayRow({
  day,
  serverToday,
  onChanged,
}: {
  day: PlannedDay;
  serverToday: string;
  onChanged: () => void;
}) {
  const { t, language } = useI18n();
  const [questionId, setQuestionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const set = useMutation({
    mutationFn: (id: string | null) => getBrowserApiClient().setDailyQuestion(day.forDate, id),
    onSuccess: () => {
      setError(null);
      setQuestionId("");
      onChanged();
    },
    onError: (err) => setError(describeError(t, err)),
  });

  // A day with no row has nothing to refuse yet. One that exists locks the
  // moment anyone answers it -- the server is the real gate, and 409s -- so
  // this only explains why the controls are gone.
  const answers = day.row?.answer_count ?? 0;
  const locked = day.row !== undefined && !day.row.can_change;
  const isToday = day.forDate === serverToday;

  return (
    <li className="border-t border-border py-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <p className="text-ui font-extrabold text-foreground">
          {isToday
            ? t("admin.daily.todayWithDate", { date: formatCalendarDate(day.forDate, language) })
            : formatCalendarDate(day.forDate, language)}
        </p>
        <p className="text-xs text-muted-foreground">
          {day.row?.overridden
            ? t("admin.daily.chosenByAdmin")
            : day.row
              ? t("admin.daily.drawnAtRandom")
              : t("admin.daily.notDrawn")}
          {answers > 0 && t("admin.daily.answers", { count: answers })}
        </p>
      </div>

      <p className="mt-xs text-sm text-muted-foreground">
        {day.row?.question ? day.row.question.prompt : t("admin.daily.noQuestionPicked")}
      </p>

      {error && (
        <p role="alert" className="mt-sm text-sm text-danger">
          {error}
        </p>
      )}

      {locked ? (
        <p className="mt-sm text-xs text-muted-foreground">
          {t("admin.daily.locked", { count: answers })}
        </p>
      ) : (
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          {/* A day with no row has nothing to replace, so "different" would be
              a lie -- but it is the same request either way. */}
          <Button variant="secondary" disabled={set.isPending} onClick={() => set.mutate(null)}>
            {day.row ? t("admin.daily.drawDifferent") : t("admin.daily.draw")}
          </Button>
          <input
            type="text"
            value={questionId}
            onChange={(event) => setQuestionId(event.target.value)}
            placeholder={t("admin.daily.questionId")}
            aria-label={t("admin.daily.questionIdFor", {
              date: formatCalendarDate(day.forDate, language),
            })}
            className="field flex-1"
          />
          <Button
            variant="secondary"
            disabled={questionId.trim() === "" || set.isPending}
            onClick={() => set.mutate(questionId.trim())}
          >
            {t("admin.daily.set")}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Plan which question each of the coming days gets.
 *
 * **A deliberate exception to the contextual-inline rule** that
 * docs/architecture/README.md records, and worth naming as one rather than
 * leaving it to look like drift. A per-day assignment could have gone inline
 * in the overlay on `/learn`; it lives here because planning a fortnight ahead
 * wants every day in one view, which an overlay scoped to a single day cannot
 * give. The consequence, stated plainly: mobile admins cannot override, the
 * same trade the two bulk importers already make.
 *
 * The role check below is presentation only. `require_admin` on the admin
 * router is the real gate.
 */
export default function DailyQuestionAdminPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  const days = useQuery({
    queryKey: ["daily-question", "admin"],
    queryFn: () => getBrowserApiClient().getDailyQuestionAdmin(),
    enabled: me.data?.role === "admin",
  });

  if (me.isPending) {
    return (
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  if (me.data?.role !== "admin") {
    return (
      <PageMain width="reading">
        <PageHeader kicker={t("admin.adminKicker")} title={t("admin.tools.daily")} />
        <p className="mt-md text-sm font-medium text-muted-foreground">
          {t("admin.accessRequired")}
        </p>
      </PageMain>
    );
  }

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("admin.adminKicker")} title={t("admin.tools.daily")} />
      <p className="text-toc text-muted-foreground">
        {t("admin.daily.intro", { days: days.data?.horizon_days ?? 14 })}
      </p>

      {days.isPending && (
        <p className="mt-lg text-sm text-muted-foreground">{t("admin.daily.loadingDays")}</p>
      )}
      {days.isError && (
        <p role="alert" className="mt-lg text-sm text-danger">
          {t("admin.daily.loadFailed")}
        </p>
      )}

      {days.data && (
        <ul className="mt-lg border-b border-border">
          {/* The API returns only the days that have a row, so the window is
              rebuilt from server_today -- never from the device clock, which
              could be in another timezone and would mis-label every row. Its
              length comes from the response too, so this cannot draw a window
              the endpoint does not cover. */}
          {Array.from({ length: days.data.horizon_days + 1 }, (_, offset) => {
            const forDate = addDays(days.data.server_today, offset);
            return (
              <DayRow
                key={forDate}
                day={{ forDate, row: days.data.days.find((row) => row.for_date === forDate) }}
                serverToday={days.data.server_today}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ["daily-question"] })}
              />
            );
          })}
        </ul>
      )}
    </PageMain>
  );
}
