import type { DailyQuestion } from "@lp/api-client";
import type { Translator } from "@lp/ui";
import { Pressable, Text } from "react-native";

import { fontSizes, fontWeights, shadows, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

/** One line describing today. The same wording as the web rail and card. */
export function summariseDay(t: Translator["t"], today: DailyQuestion): string {
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

/** The Learn hub's entry point to the question of the day.
 *
 * Deliberately a sixth card in the existing nav grid rather than something
 * that floats above it: the web layout does the same below `lg`, and a card is
 * what everything else on this screen already is.
 */
export function DailyQuestionCard({ today, onOpen }: { today: DailyQuestion; onOpen: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
      onPress={onOpen}
      accessibilityRole="button"
    >
      <Text style={styles.navCardTitle}>{t("daily.title")}</Text>
      <Text style={styles.navCardSubtitle}>{summariseDay(t, today)}</Text>
    </Pressable>
  );
}

// Matching learn/index.tsx's navCard rather than importing it: those styles are
// private to that screen, and copying five lines beats exporting a style sheet
// so that a card can sit beside its peers.
const useStyles = makeStyles((colors) => ({
  navCard: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
    padding: spacing.lg,
    ...shadows.sm,
  },
  cardPressed: {
    opacity: 0.85,
  },
  navCardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  navCardSubtitle: {
    marginTop: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
}));
