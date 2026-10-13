import type { DailyQuestion, DailyQuestionDay } from "@lp/api-client";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatCalendarDate,
  monthOf,
  monthRange,
  shiftMonth,
} from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { DailyQuestionBody } from "@/lib/daily-question-body";
import { Overlay } from "@/lib/overlay";
import { readDismissedDate, writeDismissedDate } from "@/lib/qotd-dismissal";
import { OUTCOME_MARKS } from "@/lib/question-reveal";
import { colors, fontSizes, fontWeights, radii, spacing } from "@/lib/theme";

/** Today's question, plus which day the sheet is showing.
 *
 * The mobile half of apps/web/src/components/daily-question-overlay.tsx, and
 * it keeps the one rule that matters: today is read through
 * `GET /v1/daily-question`, the **only** endpoint that draws the day when
 * nobody has opened it yet. `GET /{for_date}` reads an existing row and
 * deliberately never materialises one, so routing today through it would 404
 * until some other visitor happened to trigger the draw.
 *
 * The dismissal marker goes through react-query rather than
 * `useSyncExternalStore` as on web, because AsyncStorage is async. That also
 * keeps auto-open a plain derivation instead of state written from an effect.
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

  // Set the moment the reader takes control of the sheet, by opening a day, by
  // answering, or by closing. Auto-open is a *derivation*, so without this
  // latch a close whose marker write failed would immediately re-derive as
  // open and trap them in it.
  const [chosen, setChosen] = useState<{ date: string | null } | null>(null);

  const dismiss = useMutation({
    mutationFn: writeDismissedDate,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["qotd-dismissed"] }),
  });

  const day = today.data;
  const autoOpen =
    day !== undefined &&
    // Not until the marker has actually been read: `undefined` compares
    // unequal to today's date, and would flash the sheet open on someone who
    // had already dismissed it.
    dismissed.isSuccess &&
    day.attempt === null && // unanswered, here or on another device
    day.question !== null && // an empty bank stays quiet
    dismissed.data !== day.server_today;

  const openDate = chosen ? chosen.date : autoOpen ? day.server_today : null;
  const serverToday = day?.server_today;

  const open = useCallback((forDate: string) => setChosen({ date: forDate }), []);
  const holdOpen = useCallback(() => setChosen({ date: openDate }), [openDate]);

  const close = useCallback(() => {
    // The marker means "today's question has been offered", not "this exact
    // day was closed", so closing writes it whichever day is on screen. That
    // matters more here than on web: the calendar below sits *inside* the
    // sheet, so browsing to a past day and then closing is reachable, and a
    // day-specific marker would leave today un-offered.
    if (serverToday !== undefined) dismiss.mutate(serverToday);
    setChosen({ date: null });
  }, [dismiss, serverToday]);

  return { today, openDate, open, holdOpen, close };
}

function dayAccessibilityLabel(
  date: string,
  row: DailyQuestionDay | undefined,
  isToday: boolean,
): string {
  const when = isToday ? `Today, ${formatCalendarDate(date)}` : formatCalendarDate(date);
  if (row?.answered && row.outcome) return `${when}: ${OUTCOME_MARKS[row.outcome].label}`;
  return `${when}: not answered`;
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
  const currentMonth = monthOf(serverToday);
  const [month, setMonth] = useState(currentMonth);
  const atCurrentMonth = month >= currentMonth;

  const calendar = useQuery({
    queryKey: ["daily-question", "calendar", month],
    // The server clamps `end` to its own today, so asking for the whole month
    // is safe even for the current one.
    queryFn: () => getApiClient().getDailyQuestionCalendar(monthRange(month)),
  });

  const grid = buildMonthGrid(month, { today: serverToday });
  const rows = new Map((calendar.data?.days ?? []).map((row) => [row.for_date, row]));

  return (
    <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setMonth(shiftMonth(month, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
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
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: atCurrentMonth }}
          style={[styles.monthButton, atCurrentMonth && styles.monthButtonDisabled]}
        >
          <Text style={styles.monthButtonText}>»</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
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
              <Text key={cell.date} style={[styles.dayCell, !cell.inMonth && styles.dayCellFaded]}>
                {cell.dayOfMonth}
              </Text>
            );
          }

          return (
            <Pressable
              key={cell.date}
              onPress={() => onSelectDay(cell.date)}
              accessibilityRole="button"
              accessibilityLabel={dayAccessibilityLabel(cell.date, row, cell.isToday)}
              accessibilityState={{ selected: cell.date === selected }}
              style={[
                styles.dayCellPressable,
                cell.isToday && styles.dayCellToday,
                cell.date === selected && styles.dayCellSelected,
              ]}
            >
              <Text
                style={[
                  styles.dayCellText,
                  mark ? { color: mark.color } : null,
                  !cell.inMonth && styles.dayCellFaded,
                ]}
              >
                {cell.dayOfMonth}
              </Text>
              {mark && <Text style={[styles.dayMark, { color: mark.color }]}>{mark.icon}</Text>}
            </Pressable>
          );
        })}
      </View>

      {calendar.isError && <Text style={styles.error}>Failed to load the calendar.</Text>}
    </View>
  );
}

export function DailyQuestionOverlay({
  forDate,
  today,
  onSelectDay,
  onAnswered,
  onClose,
}: {
  /** `null` when the sheet is closed. */
  forDate: string | null;
  /** Already-loaded today, from `useDailyQuestion`. */
  today: DailyQuestion;
  onSelectDay: (forDate: string) => void;
  onAnswered: () => void;
  onClose: () => void;
}) {
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
    <Overlay visible={forDate !== null} title="Question of the day" onClose={onClose}>
      <MonthCalendar
        serverToday={today.server_today}
        selected={forDate}
        onSelectDay={onSelectDay}
      />
      {forDate !== null && (
        <Text style={styles.dayHeading}>{isToday ? "Today" : formatCalendarDate(forDate)}</Text>
      )}
      {day ? (
        <DailyQuestionBody day={day} onAnswered={onAnswered} />
      ) : past.isError ? (
        <Text style={styles.error}>Failed to load that day.</Text>
      ) : (
        <Text style={styles.hint}>Loading...</Text>
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: fontWeights.medium,
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
    color: colors.mutedForeground,
  },
  dayCell: {
    width: `${100 / 7}%`,
    textAlign: "center",
    // Matches dayCellPressable's vertical box, plus its 1px border, so inert
    // days line up with pressable ones instead of drifting half a row.
    paddingVertical: spacing.xs + 1,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  dayCellPressable: {
    width: `${100 / 7}%`,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayCellToday: {
    borderColor: colors.primary,
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
});
