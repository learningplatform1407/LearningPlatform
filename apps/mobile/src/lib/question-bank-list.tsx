import type {
  QuestionBankItem,
  QuestionReveal,
  QuizOptionResult,
  TopicFilter,
} from "@lp/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

const OUTCOME_MARKS = {
  correct: { icon: "✓", label: "Answered correctly", color: colors.success },
  partial: { icon: "◐", label: "Answered partially correctly", color: colors.warning },
  incorrect: { icon: "✗", label: "Answered incorrectly", color: colors.danger },
} as const;

/**
 * Marks a question the reader has attempted before. Outcome-coloured rather
 * than a bare tick, same reasoning as the web version: "you have seen this
 * and got it wrong" is the useful signal when deciding what to revise.
 */
function ProgressMark({
  outcome,
  pointsAwarded,
  pointsPossible,
  attemptCount,
}: {
  outcome: keyof typeof OUTCOME_MARKS;
  pointsAwarded: number;
  pointsPossible: number;
  attemptCount?: number;
}) {
  const mark = OUTCOME_MARKS[outcome];
  const tries = attemptCount !== undefined && attemptCount > 1 ? `, ${attemptCount} attempts` : "";
  return (
    <View
      style={styles.progressMark}
      accessibilityLabel={`${mark.label}, ${pointsAwarded} of ${pointsPossible} points${tries}`}
    >
      <Text style={{ color: mark.color }}>{mark.icon}</Text>
      <Text style={[styles.progressMarkText, { color: mark.color }]}>
        {pointsAwarded}/{pointsPossible}
      </Text>
      {attemptCount !== undefined && attemptCount > 1 && (
        <Text style={styles.hint}>· {attemptCount} tries</Text>
      )}
    </View>
  );
}

function OptionResultRow({ option }: { option: QuizOptionResult }) {
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

function Reveal({ reveal }: { reveal: QuestionReveal }) {
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

function QuestionCard({
  question,
  onAnswered,
}: {
  question: QuestionBankItem;
  onAnswered: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reveal, setReveal] = useState<QuestionReveal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = useMutation({
    mutationFn: () => getApiClient().answerBankQuestion(question.id, selected),
    onSuccess: (result) => {
      setReveal(result);
      onAnswered();
    },
    onError: () => setError("Could not save that answer."),
  });

  function toggle(optionId: string) {
    if (reveal) return;
    if (question.kind === "single") {
      setSelected([optionId]);
      return;
    }
    setSelected((previous) =>
      previous.includes(optionId)
        ? previous.filter((id) => id !== optionId)
        : [...previous, optionId],
    );
  }

  // The fresh reveal wins over the stored row so the mark appears the instant
  // an answer is checked, rather than waiting for the list to refetch.
  const latest = reveal ?? question.progress;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.prompt}>{question.prompt}</Text>
        {latest && (
          <ProgressMark
            outcome={latest.outcome}
            pointsAwarded={latest.points_awarded}
            pointsPossible={latest.points_possible}
            attemptCount={question.progress?.attempt_count}
          />
        )}
      </View>

      <View style={styles.optionList}>
        {question.options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={styles.optionRow}
              onPress={() => toggle(option.id)}
              disabled={reveal !== null}
              accessibilityRole={question.kind === "single" ? "radio" : "checkbox"}
              accessibilityState={{ checked, disabled: reveal !== null }}
            >
              <Text style={styles.optionMark}>
                {question.kind === "single" ? (checked ? "●" : "○") : checked ? "☑" : "☐"}
              </Text>
              <Text style={styles.optionText}>{option.text}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.meta}>
        {question.kind === "single" ? "Single answer" : "Multiple answers"} ·{" "}
        {question.points_possible} points · {question.difficulty}
      </Text>
      {question.tags.length > 0 && (
        <View style={styles.tagRow}>
          {question.tags.map((tag) => (
            <View key={tag.id} style={styles.tag}>
              <Text style={styles.tagText}>{tag.label}</Text>
            </View>
          ))}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {reveal ? (
        <>
          <Reveal reveal={reveal} />
          <Pressable
            style={styles.button}
            onPress={() => {
              setReveal(null);
              setSelected([]);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          style={[
            styles.button,
            (selected.length === 0 || answer.isPending) && styles.buttonDisabled,
          ]}
          onPress={() => answer.mutate()}
          disabled={selected.length === 0 || answer.isPending}
          accessibilityRole="button"
        >
          {answer.isPending ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <Text style={styles.buttonText}>Check answer</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

/**
 * Browse — and answer — published questions. Answering here records progress
 * like any other attempt and is repeatable: the bank is for study, not
 * assessment. Mirrors apps/web/src/components/question-bank-list.tsx.
 */
export function QuestionBankList({
  filter,
  unassigned,
  emptyMessage = "No questions here yet.",
}: {
  filter?: TopicFilter;
  unassigned?: boolean;
  emptyMessage?: string;
}) {
  const queryClient = useQueryClient();
  const questions = useQuery({
    queryKey: ["question-bank", filter ?? null, unassigned ?? false],
    queryFn: () => getApiClient().listQuestionBank({ ...filter, unassigned }),
  });
  const total = useQuery({
    queryKey: ["question-bank-total", filter ?? null],
    queryFn: () => getApiClient().getQuizAvailableCount(filter),
    enabled: !unassigned,
  });

  if (questions.isPending) {
    return <Text style={styles.hint}>Loading questions...</Text>;
  }
  if (questions.isError) {
    return <Text style={styles.error}>Failed to load questions.</Text>;
  }
  if (questions.data.length === 0) {
    return <Text style={styles.hint}>{emptyMessage}</Text>;
  }

  const shown = questions.data.length;
  const totalCount = total.data?.available;

  return (
    <View style={styles.list}>
      <Text style={styles.hint}>
        {totalCount !== undefined && totalCount > shown
          ? `Showing ${shown} of ${totalCount} questions`
          : `${shown} question${shown === 1 ? "" : "s"}`}
      </Text>
      {questions.data.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          onAnswered={() => {
            queryClient.invalidateQueries({ queryKey: ["question-bank-tree"] });
            queryClient.invalidateQueries({ queryKey: ["question-bank"] });
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  prompt: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  progressMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressMarkText: {
    fontSize: fontSizes.xs,
  },
  optionList: {
    gap: spacing.xs,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  optionMark: {
    fontSize: fontSizes.base,
    color: colors.foreground,
    width: 20,
  },
  optionText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  meta: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  tagText: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  button: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  reveal: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.muted,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  revealTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  optionResultList: {
    gap: spacing.xs,
  },
  optionResultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  optionResultText: {
    flex: 1,
  },
  rationale: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
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
