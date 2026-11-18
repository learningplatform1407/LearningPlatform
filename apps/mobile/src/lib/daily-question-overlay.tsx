import type { DailyQuestion, DailyQuestionDay } from "@lp/api-client";
import {
  buildMonthGrid,
  formatCalendarDate,
  monthOf,
  shiftMonth,
  weekdayLabels,
  type Translator,
} from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "expo-router";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { getApiClient } from "@/lib/api-client";
import { DailyQuestionBody } from "@/lib/daily-question-body";
import { Overlay } from "@/lib/overlay";
import { readDismissedDate, writeDismissedDate } from "@/lib/qotd-dismissal";
import { OUTCOME_MARKS } from "@/lib/question-reveal";
import { fontSizes, fontWeights, radii, shadows, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { CloseIcon } from "@/lib/ui/icons";
import { useI18n } from "@/lib/i18n";

/** Today's question, plus which day the sheet is showing.
 *
 * The mobile half of apps/web/src/components/daily-question-overlay.tsx, and
 * it keeps the one rule that matters: today is read through
 * `GET /v1/daily-question`, the **only** endpoint that draws the day when
 * nobody has opened it yet. `GET /{for_date}` reads an existing row and
 * deliberately never materialises one, so routing today through it would 404
 * until some other visitor happened to trigger the draw.
 *
 * Lives in the app layout (`DailyQuestionProvider`), because the "available"
 * notice shows on every screen and opens the same sheet as the Learn card.
 *
 * The dismissal marker goes through react-query rather than
 * `useSyncExternalStore` as on web, because AsyncStorage is async. That also
 * keeps the notice a plain derivation instead of state written from an effect.
 */
export function useDailyQuestion() {
  const queryClient = useQueryClient();

  const today = useQuery({
    queryKey: ["daily-question", "today"],
    queryFn: () => getApiClient().getDailyQuestion(),
  });

  const dismissed = useQuery({
    queryKey: ["qotd-dismissed"],
    queryFn: readDismissedDate,
  });

  const [openDate, setOpenDate] = useState<string | null>(null);
  // Set once the reader has opened or dismissed today's question this
  // session, so the notice goes away even if the marker write fails.
  const [handled, setHandled] = useState(false);

  const dismiss = useMutation({
    mutationFn: writeDismissedDate,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["qotd-dismissed"] }),
  });
  // `mutate` is stable; the mutation object around it is not, and depending on
  // the object would churn the callbacks' identity on every render.
  const recordDismissal = dismiss.mutate;

  const day = today.data;
  // The notice replaces the old auto-open: the question no longer takes over
  // the screen, it only says it is waiting.
  const showNotice =
    day !== undefined &&
    // Not until the marker has actually been read: `undefined` compares
    // unequal to today's date, and would flash the notice at someone who had
    // already dismissed it.
    dismissed.isSuccess &&
    day.attempt === null && // unanswered, here or on another device
    day.question !== null && // an empty bank stays quiet
    !handled &&
    dismissed.data !== day.server_today;

  const serverToday = day?.server_today;
  const hasQuestion = day?.question != null;

  // The marker means "today's question has been offered", so opening today
  // or dismissing the notice both write it. Except when there is nothing to
  // offer: the hub card still opens on an empty-bank day to report the
  // emptiness, and marking today from there would hide the notice if an admin
  // published a question later the same day.
  const markOffered = useCallback(() => {
    if (serverToday === undefined || !hasQuestion) return;
    recordDismissal(serverToday);
    setHandled(true);
  }, [hasQuestion, recordDismissal, serverToday]);

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

// The lesson reader is a reading surface with its own top notch, so the
// notice waits until the reader leaves it -- the same rule as web.
const LESSON_ROUTE = /^\/learn\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The question of the day for the whole app: one fetch, one sheet, and the
 * top-right "available" notice on every screen. */
export function DailyQuestionProvider({ children }: { children: ReactNode }) {
  const state = useDailyQuestion();
  const day = state.today.data;
  const reading = LESSON_ROUTE.test(usePathname());
  return (
    <DailyQuestionContext.Provider value={state}>
      {children}
      {state.showNotice && state.openDate === null && !reading && day && (
        <DailyQuestionNotice
          onOpen={() => state.open(day.server_today)}
          onDismiss={state.dismissNotice}
        />
      )}
      {/* One sheet for every entry point, so the notice, the card and the
          calendar inside the sheet cannot each open their own. */}
      {day && (
        <DailyQuestionOverlay
          forDate={state.openDate}
          today={day}
          onSelectDay={state.open}
          onClose={state.close}
        />
      )}
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
  const styles = useStyles();
  const colors = useThemeColors();
  const { t } = useI18n();
  // The context rather than `useSafeAreaInsets()`, which throws when no
  // provider is mounted (see lib/overlay.tsx).
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <View
      style={[styles.notice, { top: (insets?.top ?? 0) + spacing.sm }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.noticeDot} />
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t("daily.available")}. ${t("daily.availableAction")}`}
        style={styles.noticeBody}
      >
        <Text style={styles.noticeTitle}>{t("daily.available")}</Text>
        <Text style={styles.noticeAction}>{t("daily.availableAction")}</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t("daily.dismissNotice")}
        hitSlop={8}
        style={styles.noticeClose}
      >
        <CloseIcon size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function dayAccessibilityLabel(
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

/** A month of days, each openable if it has a question.
 *
 * On web this is a rail beside the Learn hub; there is no room for that on a
 * phone, so it lives at the top of the sheet instead. Same shared month maths
 * either way, and `server_today` is still the only source of "what day is it".
 */
function MonthCalendar({
  serverToday,
  selected,
  onSelectDay,
}: {
  serverToday: string;
  selected: string | null;
  onSelectDay: (forDate: string) => void;
}) {
  const styles = useStyles();
  const i18n = useI18n();
  const { t } = i18n;
  const colors = useThemeColors();
  const currentMonth = monthOf(serverToday);
  const [month, setMonth] = useState(currentMonth);
  const atCurrentMonth = month >= currentMonth;

  // Built before the query, because the grid is what decides the range to
  // fetch: it renders six weeks, so it reaches into both neighbouring months,
  // and asking only for this month's own days would leave those padding cells
  // matching no row -- inert and unmarked even for a day you answered. The
  // server clamps `end` to its own today, so a range running into next month
  // is safe.
  const grid = buildMonthGrid(month, { today: serverToday, language: i18n.language });

  const calendar = useQuery({
    queryKey: ["daily-question", "calendar", month],
    queryFn: () => getApiClient().getDailyQuestionCalendar(grid.range),
  });
  const rows = new Map((calendar.data?.days ?? []).map((row) => [row.for_date, row]));

  return (
    <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setMonth(shiftMonth(month, -1))}
          accessibilityRole="button"
          accessibilityLabel={t("daily.previousMonth")}
          style={styles.monthButton}
        >
          <Text style={styles.monthButtonText}>«</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{grid.label}</Text>
        <Pressable
          // Nothing exists past the current month: future days are never drawn
          // for a learner, so paging forward would only show an empty grid.
          onPress={() => setMonth(shiftMonth(month, 1))}
          disabled={atCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel={t("daily.nextMonth")}
          accessibilityState={{ disabled: atCurrentMonth }}
          style={[styles.monthButton, atCurrentMonth && styles.monthButtonDisabled]}
        >
          <Text style={styles.monthButtonText}>»</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {weekdayLabels(i18n.language).map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label.slice(0, 1)}
          </Text>
        ))}
      </View>

      <View style={styles.weekRow}>
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
              <View key={cell.date} style={styles.dayCell}>
                <Text
                  style={[
                    styles.dayCellText,
                    styles.dayCellMuted,
                    !cell.inMonth && styles.dayCellFaded,
                  ]}
                >
                  {cell.dayOfMonth}
                </Text>
              </View>
            );
          }

          return (
            <Pressable
              key={cell.date}
              onPress={() => onSelectDay(cell.date)}
              accessibilityRole="button"
              accessibilityLabel={dayAccessibilityLabel(i18n, cell.date, row, cell.isToday)}
              accessibilityState={{ selected: cell.date === selected }}
              style={[
                styles.dayCellPressable,
                cell.date === selected && styles.dayCellSelected,
                // After dayCellSelected, not before: today should always read
                // as today, even on the one day that's also the open one.
                cell.isToday && styles.dayCellToday,
              ]}
            >
              <Text
                style={[
                  styles.dayCellText,
                  mark && !cell.isToday ? { color: colors[mark.tone] } : null,
                  cell.isToday && { color: colors.primaryForeground },
                  !cell.inMonth && styles.dayCellFaded,
                ]}
              >
                {cell.dayOfMonth}
              </Text>
              {mark && (
                <Text
                  style={[
                    styles.dayMark,
                    { color: cell.isToday ? colors.primaryForeground : colors[mark.tone] },
                  ]}
                >
                  {mark.icon}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {calendar.isError && <Text style={styles.error}>{t("daily.calendarFailed")}</Text>}
    </View>
  );
}

export function DailyQuestionOverlay({
  forDate,
  today,
  onSelectDay,
  onClose,
}: {
  /** `null` when the sheet is closed. */
  forDate: string | null;
  /** Already-loaded today, from `useDailyQuestion`. */
  today: DailyQuestion;
  onSelectDay: (forDate: string) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t, language } = useI18n();
  const isToday = forDate === today.server_today;

  // Only past days need a fetch; today is already in hand, and is the one day
  // whose endpoint has a side effect.
  const past = useQuery({
    queryKey: ["daily-question", "day", forDate],
    queryFn: () => getApiClient().getDailyQuestionForDate(forDate as string),
    enabled: forDate !== null && !isToday,
  });

  const day: DailyQuestion | undefined = isToday ? today : past.data;

  return (
    <Overlay visible={forDate !== null} title={t("daily.title")} onClose={onClose}>
      <MonthCalendar
        serverToday={today.server_today}
        selected={forDate}
        onSelectDay={onSelectDay}
      />
      {forDate !== null && (
        <Text style={styles.dayHeading}>
          {isToday ? t("daily.today") : formatCalendarDate(forDate, language)}
        </Text>
      )}
      {day ? (
        <DailyQuestionBody day={day} />
      ) : past.isError ? (
        <Text style={styles.error}>{t("daily.dayFailed")}</Text>
      ) : (
        <Text style={styles.hint}>{t("common.loading")}</Text>
      )}
    </Overlay>
  );
}

const useStyles = makeStyles((colors) => ({
  notice: {
    position: "absolute",
    right: spacing.md,
    maxWidth: 340,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    ...shadows.md,
  },
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  noticeBody: {
    flexShrink: 1,
    paddingVertical: spacing.xs,
  },
  noticeTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
  noticeAction: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.accent,
  },
  noticeClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  calendar: {
    gap: spacing.sm,
  },
  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  monthButtonDisabled: {
    opacity: 0.4,
  },
  monthButtonText: {
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  monthLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  weekRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  // Seven to a row, so every cell is a seventh of the width. A percentage
  // rather than flex, because the grid wraps instead of nesting a View per
  // week -- six of those would be six more layout passes for no gain.
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  // Same box as dayCellPressable (width/aspectRatio/centering) so inert days
  // line up with pressable ones instead of drifting out of row.
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellMuted: {
    color: colors.mutedForeground,
  },
  dayCellPressable: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
  },
  dayCellToday: {
    backgroundColor: colors.primary,
  },
  dayCellSelected: {
    backgroundColor: colors.muted,
  },
  dayCellText: {
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  dayMark: {
    fontSize: fontSizes.xs,
  },
  dayCellFaded: {
    opacity: 0.5,
  },
  dayHeading: {
    marginTop: spacing.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
}));
