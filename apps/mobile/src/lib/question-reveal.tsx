import type { QuestionReveal, QuizOptionResult } from "@lp/api-client";
import { Pressable, Text, View } from "react-native";

import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

/** `tone` names a theme colour, read as `colors[mark.tone]` so the mark
 * follows the active theme. */
export const OUTCOME_MARKS = {
  correct: { icon: "✓", tone: "good" },
  partial: { icon: "◐", tone: "hard" },
  incorrect: { icon: "✗", tone: "again" },
} as const;

export type Outcome = keyof typeof OUTCOME_MARKS;

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** One graded option, with the design's letter circle (design.md §12):
 * green when the option is in the answer, red when you picked it and it
 * isn't. Exported because the quiz results screen lists options without the
 * surrounding panel. */
export function OptionResultRow({ option, index }: { option: QuizOptionResult; index: number }) {
  const { t } = useI18n();
  const styles = useStyles();
  // Two independent axes: whether the option belongs in the answer (in_key)
  // and whether the student earned its point (classified_correctly). Avoiding
  // a wrong option scores, so collapsing these would call a wrong option
  // "right".
  const earned = option.classified_correctly ? t("questions.gotRight") : t("questions.missed");
  return (
    <View
      style={styles.optionRow}
      accessible
      accessibilityLabel={`${optionLetter(index)}. ${option.text}${option.selected ? t("questions.yourChoice") : ""}${
        option.in_key ? t("questions.inAnswer") : ""
      }, ${earned}`}
    >
      <View
        style={[
          styles.letter,
          option.in_key ? styles.letterKey : option.selected ? styles.letterWrong : null,
        ]}
      >
        <Text
          style={[styles.letterText, (option.in_key || option.selected) && styles.letterTextOn]}
        >
          {optionLetter(index)}
        </Text>
      </View>
      <View style={styles.optionBody}>
        <Text style={styles.optionText}>{option.text}</Text>
        <Text style={styles.rationale}>
          <Text style={option.in_key ? styles.verdictTrue : styles.verdictFalse}>
            {option.in_key ? t("questions.true") : t("questions.false")}
          </Text>
          {option.rationale ? ` ${option.rationale}` : ""}
        </Text>
      </View>
    </View>
  );
}

/** One answerable option: the letter circle fills with ink when chosen. */
export function OptionChoice({
  kind,
  index,
  text,
  checked,
  disabled,
  onPress,
}: {
  kind: string;
  index: number;
  text: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={styles.optionRow}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === "single" ? "radio" : "checkbox"}
      accessibilityState={{ checked, disabled }}
    >
      <View style={[styles.letter, checked && styles.letterChosen]}>
        <Text style={[styles.letterText, checked && styles.letterTextChosen]}>
          {optionLetter(index)}
        </Text>
      </View>
      <Text style={[styles.optionText, styles.optionBody]}>{text}</Text>
    </Pressable>
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
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const tone = colors[OUTCOME_MARKS[reveal.outcome].tone];
  // A framed block with its own heading, so the answers read as a separate
  // part from the question above them and from the next question below.
  return (
    <View style={[styles.reveal, { borderLeftColor: tone }]}>
      <Text style={[styles.revealTitle, { color: tone }]}>
        {t("questions.answersHeading", {
          outcome: t(`questions.outcome.${reveal.outcome}`),
          awarded: reveal.points_awarded,
          possible: reveal.points_possible,
        })}
      </Text>
      <View>
        {reveal.options.map((option, index) => (
          <OptionResultRow key={option.id} option={option} index={index} />
        ))}
      </View>
      {reveal.explanation && <Text style={styles.rationale}>{reveal.explanation}</Text>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  reveal: {
    gap: spacing.xs,
    marginTop: spacing.xs,
    backgroundColor: colors.muted,
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  revealTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extrabold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.foreground,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionBody: { flex: 1, gap: 4 },
  optionText: {
    fontSize: fontSizes.base,
    lineHeight: 22,
    color: colors.foreground,
  },
  letter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  letterKey: { backgroundColor: colors.good, borderColor: colors.good },
  letterWrong: { backgroundColor: colors.again, borderColor: colors.again },
  letterChosen: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  letterText: {
    fontSize: 13,
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  letterTextOn: { color: "#FFFFFF" },
  letterTextChosen: { color: colors.background },
  rationale: {
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.mutedForeground,
  },
  verdictTrue: { fontWeight: fontWeights.bold, color: colors.good },
  verdictFalse: { fontWeight: fontWeights.bold, color: colors.again },
}));
