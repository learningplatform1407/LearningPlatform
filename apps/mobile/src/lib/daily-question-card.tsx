import type { DailyQuestion } from "@lp/api-client";
import { Pressable, StyleSheet, Text } from "react-native";

import { OUTCOME_MARKS } from "@/lib/question-reveal";
import { colors, fontSizes, fontWeights, radii, shadows, spacing } from "@/lib/theme";

/** One line describing today. The same wording as the web rail and card. */
export function summariseDay(today: DailyQuestion): string {
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

/** The Learn hub's entry point to the question of the day.
 *
 * Deliberately a sixth card in the existing nav grid rather than something
 * that floats above it: the web layout does the same below `lg`, and a card is
 * what everything else on this screen already is.
 */
export function DailyQuestionCard({ today, onOpen }: { today: DailyQuestion; onOpen: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
      onPress={onOpen}
      accessibilityRole="button"
    >
      <Text style={styles.navCardTitle}>Question of the day</Text>
      <Text style={styles.navCardSubtitle}>{summariseDay(today)}</Text>
    </Pressable>
  );
}

// Matching learn/index.tsx's navCard rather than importing it: those styles are
// private to that screen, and copying five lines beats exporting a style sheet
// so that a card can sit beside its peers.
const styles = StyleSheet.create({
  navCard: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
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
});
