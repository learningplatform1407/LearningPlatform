"use client";

import type { DailyQuestion } from "@lp/api-client";
import { formatCalendarDate, type Translator } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { DailyQuestionBody } from "@/components/daily-question-body";
import { CloseIcon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { LESSON_ROUTE } from "@/components/sidebar";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { readDismissedDate, subscribeDismissal, writeDismissedDate } from "@/lib/qotd-dismissal";
import { useI18n } from "@/lib/i18n";

/** Today's question, plus which day the overlay is showing.
 *
 * Lives in the app layout (`DailyQuestionProvider`), not the Learn page: the
 * "available" notice can appear on any page, and it opens the same overlay
 * as the Learn rail and card, so the state has to sit above all of them.
 *
 * `today` is fetched through `GET /v1/daily-question` -- the **only** endpoint
 * that draws the day if nobody has opened it yet. `GET /{for_date}` reads an
 * existing row and deliberately never materialises one, so asking it for today
 * would 404 until some other visitor happened to trigger the draw. Everything
 * here therefore routes today's question through this one query, which also
 * means the notice, the rail, the card and the overlay share a single fetch.
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

  const [openDate, setOpenDate] = useState<string | null>(null);
  // Set once the reader has opened or dismissed today's question in this
  // tab, so the notice goes away even when the marker could not be stored
  // (Safari in private mode throws on setItem).
  const [handled, setHandled] = useState(false);

  const day = today.data;
  // The notice replaces the old auto-open: the question no longer takes over
  // the screen, it only says it is waiting.
  const showNotice =
    day !== undefined &&
    day.attempt === null && // unanswered, here or on another device
    day.question !== null && // an empty bank stays quiet
    !handled &&
    dismissed !== day.server_today;

  const serverToday = day?.server_today;
  const hasQuestion = day?.question != null;

  // The marker means "today's question has been offered", so opening it --
  // from the notice, the rail or the card -- or dismissing the notice both
  // write it. Except when there is nothing to offer: the card still opens on
  // an empty-bank day to report the emptiness, and marking today from there
  // would hide the notice if an admin published a question later that day.
  const markOffered = useCallback(() => {
    if (serverToday === undefined || !hasQuestion) return;
    writeDismissedDate(serverToday);
    setHandled(true);
  }, [hasQuestion, serverToday]);

  const open = useCallback(
    (forDate: string) => {
      if (forDate === serverToday) markOffered();
      setOpenDate(forDate);
    },
    [markOffered, serverToday],
  );

  const close = useCallback(() => setOpenDate(null), []);

  return { today, openDate, open, close, showNotice, dismissNotice: markOffered };
}

type DailyQuestionState = ReturnType<typeof useDailyQuestion>;

const DailyQuestionContext = createContext<DailyQuestionState | null>(null);

/** The question of the day for the whole app: one fetch, one overlay, and
 * the top-right "available" notice on every page. */
export function DailyQuestionProvider({ children }: { children: ReactNode }) {
  const state = useDailyQuestion();
  const day = state.today.data;
  // Not over the lesson reader, which hides the sidebar for the same reason:
  // it is a reading surface, and its top notch owns that edge of the screen.
  const reading = LESSON_ROUTE.test(usePathname() ?? "");
  return (
    <DailyQuestionContext.Provider value={state}>
      {children}
      {state.showNotice && state.openDate === null && !reading && day && (
        <DailyQuestionNotice
          onOpen={() => state.open(day.server_today)}
          onDismiss={state.dismissNotice}
        />
      )}
      {/* One overlay for every entry point, so the notice, the rail and the
          card cannot each open their own. */}
      {day && <DailyQuestionOverlay forDate={state.openDate} today={day} onClose={state.close} />}
    </DailyQuestionContext.Provider>
  );
}

export function useDailyQuestionContext(): DailyQuestionState {
  const state = useContext(DailyQuestionContext);
  if (!state) throw new Error("useDailyQuestionContext must be used inside DailyQuestionProvider");
  return state;
}

/** "Question of the day available", top-right. Opens the question, or goes
 * away for the rest of the day. */
function DailyQuestionNotice({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="fixed top-[calc(12px+env(safe-area-inset-top,0px))] right-md z-[70] flex max-w-[calc(100vw-32px)] animate-[drawer-in-right_0.25s_ease] items-center gap-xs rounded-lg border border-border bg-background py-1.5 pr-1.5 pl-md shadow-bubble motion-reduce:animate-none"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 rounded-sm px-xs py-1 text-left text-toc leading-snug font-bold text-foreground hover:underline"
      >
        {t("daily.available")}
        <span className="ml-sm font-semibold text-accent">{t("daily.availableAction")}</span>
      </button>
      <button
        type="button"
        aria-label={t("daily.dismissNotice")}
        onClick={onDismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

/** "Question of the day" for today, the date itself for any other day. */
export function dayTitle(
  { t, language }: Translator,
  forDate: string,
  serverToday: string,
): string {
  return forDate === serverToday ? t("daily.title") : formatCalendarDate(forDate, language);
}

export function DailyQuestionOverlay({
  forDate,
  today,
  onClose,
}: {
  /** `null` when nothing is open. */
  forDate: string | null;
  /** Already-loaded today, from `useDailyQuestion`. */
  today: DailyQuestion;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
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
      title={forDate === null ? "" : dayTitle(i18n, forDate, today.server_today)}
      onClose={onClose}
    >
      {day ? (
        <DailyQuestionBody day={day} />
      ) : past.isError ? (
        <p role="alert" className="text-sm text-danger">
          {t("daily.dayFailed")}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
    </Modal>
  );
}
