"use client";

import type { DailyQuestionAdminDay } from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import { addDays, formatCalendarDate } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    const body = err.body as { message?: string } | null;
    return body?.message ?? `Request failed with status ${err.status}`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
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
  const [questionId, setQuestionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const set = useMutation({
    mutationFn: (id: string | null) => getBrowserApiClient().setDailyQuestion(day.forDate, id),
    onSuccess: () => {
      setError(null);
      setQuestionId("");
      onChanged();
    },
    onError: (err) => setError(describeError(err)),
  });

  // A day with no row has nothing to refuse yet. One that exists locks the
  // moment anyone answers it -- the server is the real gate, and 409s -- so
  // this only explains why the controls are gone.
  const answers = day.row?.answer_count ?? 0;
  const locked = day.row !== undefined && !day.row.can_change;
  const isToday = day.forDate === serverToday;

  return (
    <li className="rounded-md border border-border p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <p className="text-sm font-semibold text-foreground">
          {isToday ? `Today — ${formatCalendarDate(day.forDate)}` : formatCalendarDate(day.forDate)}
        </p>
        <p className="text-xs text-muted-foreground">
          {day.row?.overridden ? "Chosen by an admin" : day.row ? "Drawn at random" : "Not drawn"}
          {answers > 0 && ` · ${answers} answer${answers === 1 ? "" : "s"}`}
        </p>
      </div>

      <p className="mt-xs text-sm text-muted-foreground">
        {day.row?.question ? day.row.question.prompt : "No question picked yet."}
      </p>

      {error && (
        <p role="alert" className="mt-sm text-sm text-danger">
          {error}
        </p>
      )}

      {locked ? (
        <p className="mt-sm text-xs text-muted-foreground">
          {answers === 1 ? "Someone has" : `${answers} people have`} already answered this day, so
          it can no longer be changed.
        </p>
      ) : (
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          {/* A day with no row has nothing to replace, so "different" would be
              a lie -- but it is the same request either way. */}
          <Button variant="secondary" disabled={set.isPending} onClick={() => set.mutate(null)}>
            {day.row ? "Draw a different question" : "Draw a question"}
          </Button>
          <input
            type="text"
            value={questionId}
            onChange={(event) => setQuestionId(event.target.value)}
            placeholder="Question id"
            aria-label={`Question id for ${formatCalendarDate(day.forDate)}`}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-sm py-xs text-sm text-foreground"
          />
          <Button
            variant="secondary"
            disabled={questionId.trim() === "" || set.isPending}
            onClick={() => set.mutate(questionId.trim())}
          >
            Set
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
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  const days = useQuery({
    queryKey: ["daily-question", "admin"],
    queryFn: () => getBrowserApiClient().getDailyQuestionAdmin(),
    enabled: me.data?.role === "admin",
  });

  if (me.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (me.data?.role !== "admin") {
    return (
      <main className="p-xl">
        <h1 className="text-2xl font-semibold text-foreground">Question of the day</h1>
        <p className="mt-md text-sm text-muted-foreground">Admin access required.</p>
      </main>
    );
  }

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Question of the day</h1>
      <p className="mt-xs max-w-[48rem] text-sm text-muted-foreground">
        Today and the next {days.data?.horizon_days ?? 14} days. A day nobody has drawn yet gets a
        random published question the first time a learner opens it, so leaving these alone is a
        valid plan. Past days never appear here: changing one would rewrite history people have
        already answered.
      </p>

      {days.isPending && <p className="mt-lg text-sm text-muted-foreground">Loading days...</p>}
      {days.isError && (
        <p role="alert" className="mt-lg text-sm text-danger">
          Failed to load the schedule.
        </p>
      )}

      {days.data && (
        <ul className="mt-lg flex w-full max-w-[48rem] flex-col gap-sm">
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
    </main>
  );
}
