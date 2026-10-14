import type { QuestionReveal, QuizOptionResult } from "@lp/api-client";
import { StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, fontWeights, radii, spacing } from "@/lib/theme";

export const OUTCOME_MARKS = {
  correct: { icon: "✓", label: "Answered correctly", color: colors.success },
  partial: { icon: "◐", label: "Answered partially correctly", color: colors.warning },
  incorrect: { icon: "✗", label: "Answered incorrectly", color: colors.danger },
} as const;

export type Outcome = keyof typeof OUTCOME_MARKS;

/** One graded option. Exported because the quiz results screen lists options
 * without the surrounding panel. */
export function OptionResultRow({ option }: { option: QuizOptionResult }) {
  // Two independent axes: whether the option belongs in the answer (in_key)
  // and whether the student earned its point (classified_correctly). Avoiding
  // a wrong option scores, so collapsing these would call a wrong option
  // "right".
  const color = option.classified_correctly
    ? colors.success
    : option.selected
      ? colors.danger
      : colors.mutedForeground;
  return (
    <View style={styles.optionResultRow}>
      <Text style={{ color }}>{option.selected ? "☑" : "☐"}</Text>
      <View style={styles.optionResultText}>
        <Text style={styles.optionText}>
          {option.text}
          {option.in_key && <Text style={styles.hint}> (correct answer)</Text>}
        </Text>
        {option.rationale && <Text style={styles.rationale}>{option.rationale}</Text>}
      </View>
    </View>
  );
}

/** A graded question with its answer key shown.
 *
 * Extracted from question-bank-list rather than copied: the colouring above
 * had three near-identical implementations (both bank lists and exams.tsx),
 * and the warning that justifies it is only as good as the number of places it
 * lives. The question of the day would have been the fourth.
 *
 * Named `QuestionRevealPanel` so it doesn't collide with the `QuestionReveal`
 * type it renders.
 */
export function QuestionRevealPanel({ reveal }: { reveal: QuestionReveal }) {
  return (
    <View style={styles.reveal}>
      <Text style={styles.revealTitle}>
        {reveal.outcome} — {reveal.points_awarded}/{reveal.points_possible} points
      </Text>
      <View style={styles.optionResultList}>
        {reveal.options.map((option) => (
          <OptionResultRow key={option.id} option={option} />
        ))}
      </View>
      {reveal.explanation && <Text style={styles.rationale}>{reveal.explanation}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  reveal: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.muted,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  revealTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  optionResultList: { gap: spacing.xs },
  optionResultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  optionResultText: { flex: 1 },
  optionText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  rationale: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
});
