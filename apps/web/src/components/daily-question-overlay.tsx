"use client";

import type { DailyQuestion } from "@lp/api-client";
import { formatCalendarDate } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";

import { DailyQuestionBody } from "@/components/daily-question-body";
import { Modal } from "@/components/modal";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { readDismissedDate, subscribeDismissal, writeDismissedDate } from "@/lib/qotd-dismissal";

/** Today's question, plus which day the overlay is showing.
 *
 * One hook rather than state spread across the rail and the nav card: both
 * open the same overlay, and they sit in different parts of the Learn tree, so
 * the state has to live above both of them.
 *
 * `today` is fetched through `GET /v1/daily-question` -- the **only** endpoint
 * that draws the day if nobody has opened it yet. `GET /{for_date}` reads an
 * existing row and deliberately never materialises one, so asking it for today
 * would 404 until some other visitor happened to trigger the draw. Everything
 * here therefore routes today's question through this one query, which also
 * means the rail, the card and the overlay share a single fetch.
 */
export function useDailyQuestion() {
  const today = useQuery({
    queryKey: ["daily-question", "today"],
    queryFn: () => getBrowserApiClient().getDailyQuestion(),
  });

  // The dismissal marker holds the *server's* date, so this asks "have they
  // already seen today's?" without ever consulting the device clock. Read
  // through a store rather than in render, because `localStorage` does not
  // exist during Next's prerender of a client component -- the server snapshot
  // is "nothing dismissed", which is also the safe default.
  const dismissed = useSyncExternalStore(subscribeDismissal, readDismissedDate, () => null);

  // Set the moment the reader takes control of the overlay, by opening a day
  // or by closing one. Auto-open is a *derivation*, so without this latch a
  // close whose marker write failed -- Safari in private mode throws on
  // setItem -- would immediately re-derive as open and trap them in it.
  const [chosen, setChosen] = useState<{ date: string | null } | null>(null);

  const day = today.data;
  const autoOpen =
    day !== undefined &&
    day.attempt === null && // unanswered, here or on another device
    day.question !== null && // an empty bank stays quiet
    dismissed !== day.server_today;

  const openDate = chosen ? chosen.date : autoOpen ? day.server_today : null;
  const serverToday = day?.server_today;

  const open = useCallback((forDate: string) => setChosen({ date: forDate }), []);

  // Answering is also the reader taking control. Without this, submitting an
  // auto-opened question would close the overlay on them: the answer
  // invalidates the query, `attempt` comes back non-null, `autoOpen` goes
  // false, and the score they just earned never gets shown.
  const holdOpen = useCallback(() => setChosen({ date: openDate }), [openDate]);

  const close = useCallback(() => {
    // Closing *today's* question is the dismissal. Closing a past day opened
    // from the calendar is not -- otherwise browsing history would silence the
    // day's own prompt.
    if (openDate !== null && openDate === serverToday) writeDismissedDate(openDate);
    setChosen({ date: null });
  }, [openDate, serverToday]);

  return { today, openDate, open, holdOpen, close };
}

/** "Question of the day" for today, the date itself for any other day. */
export function dayTitle(forDate: string, serverToday: string): string {
  return forDate === serverToday ? "Question of the day" : formatCalendarDate(forDate);
}

export function DailyQuestionOverlay({
  forDate,
  today,
  onAnswered,
  onClose,
}: {
  /** `null` when nothing is open. */
  forDate: string | null;
  /** Already-loaded today, from `useDailyQuestion`. */
  today: DailyQuestion;
  /** `holdOpen` from `useDailyQuestion` -- keeps the reveal on screen. */
  onAnswered: () => void;
  onClose: () => void;
}) {
  const isToday = forDate === today.server_today;

  // Only past days need a fetch; today is already in hand, and is the one day
  // whose endpoint has a side effect.
  const past = useQuery({
    queryKey: ["daily-question", "day", forDate],
    queryFn: () => getBrowserApiClient().getDailyQuestionForDate(forDate as string),
    enabled: forDate !== null && !isToday,
  });

  const day: DailyQuestion | undefined = isToday ? today : past.data;

  return (
    <Modal
      open={forDate !== null}
      title={forDate === null ? "" : dayTitle(forDate, today.server_today)}
      onClose={onClose}
    >
      {day ? (
        <DailyQuestionBody day={day} onAnswered={onAnswered} />
      ) : past.isError ? (
        <p role="alert" className="text-sm text-danger">
          Failed to load that day.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}
    </Modal>
  );
}
