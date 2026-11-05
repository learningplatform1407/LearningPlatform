import type { QuestionBankItem, QuestionReveal, TopicFilter } from "@lp/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { OUTCOME_MARKS, OptionChoice, QuestionRevealPanel } from "@/lib/question-reveal";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";

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
  const styles = useStyles();
  const colors = useThemeColors();
  const mark = OUTCOME_MARKS[outcome];
  const tries = attemptCount !== undefined && attemptCount > 1 ? `, ${attemptCount} attempts` : "";
  return (
    <View
      style={styles.progressMark}
      accessibilityLabel={`${mark.label}, ${pointsAwarded} of ${pointsPossible} points${tries}`}
    >
      <Text style={{ color: colors[mark.tone] }}>{mark.icon}</Text>
      <Text style={[styles.progressMarkText, { color: colors[mark.tone] }]}>
        {pointsAwarded}/{pointsPossible}
      </Text>
      {attemptCount !== undefined && attemptCount > 1 && (
        <Text style={styles.hint}>· {attemptCount} tries</Text>
      )}
    </View>
  );
}

/** Jump to the passages a checked question came from. */
export type SeeInLesson = (questionId: string, quotes: string[]) => void;

function QuestionCard({
  question,
  onAnswered,
  onSeeInLesson,
}: {
  question: QuestionBankItem;
  onAnswered: () => void;
  onSeeInLesson?: SeeInLesson;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string[]>([]);
  const [reveal, setReveal] = useState<QuestionReveal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  // Shown at once; the server is told in the background, and a failure
  // puts the heart back.
  const [favourite, setFavourite] = useState(question.is_favourite ?? false);
  const favouriteMutation = useMutation({
    mutationFn: (on: boolean) =>
      on
        ? getApiClient().favouriteQuestion(question.id)
        : getApiClient().unfavouriteQuestion(question.id),
    onError: (_error, on) => {
      setFavourite(!on);
      setError("Could not save that favourite.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["question-bank"] }),
  });

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Favourite"
          accessibilityState={{ selected: favourite }}
          hitSlop={8}
          onPress={() => {
            setError(null);
            setFavourite(!favourite);
            favouriteMutation.mutate(!favourite);
          }}
        >
          <Text style={styles.heart}>{favourite ? "♥" : "♡"}</Text>
        </Pressable>
      </View>

      <View style={styles.optionList}>
        {question.options.map((option, index) => (
          <OptionChoice
            key={option.id}
            kind={question.kind}
            index={index}
            text={option.text}
            checked={selected.includes(option.id)}
            disabled={reveal !== null}
            onPress={() => toggle(option.id)}
          />
        ))}
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
          <QuestionRevealPanel reveal={reveal} />
          {/* Shown once checked, like the design: before that the passage
              would give the answer away. */}
          {onSeeInLesson && reveal.source_quotes && reveal.source_quotes.length > 0 && (
            <Pressable
              onPress={() => onSeeInLesson(question.id, reveal.source_quotes!)}
              accessibilityRole="link"
            >
              <Text style={styles.seeInLesson}>↗ See in lesson</Text>
            </Pressable>
          )}
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
  onSeeInLesson,
  favourites,
}: {
  filter?: TopicFilter;
  unassigned?: boolean;
  emptyMessage?: string;
  /** Offered inside a lesson only, where there is a lesson to show. */
  onSeeInLesson?: SeeInLesson;
  /** Only the learner's favourites. */
  favourites?: boolean;
}) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const questions = useQuery({
    queryKey: ["question-bank", filter ?? null, unassigned ?? false, favourites ?? false],
    queryFn: () => getApiClient().listQuestionBank({ ...filter, unassigned, favourites }),
  });
  const total = useQuery({
    queryKey: ["question-bank-total", filter ?? null],
    queryFn: () => getApiClient().getQuizAvailableCount(filter),
    enabled: !unassigned && !favourites,
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
          onSeeInLesson={onSeeInLesson}
          onAnswered={() => {
            queryClient.invalidateQueries({ queryKey: ["question-bank-tree"] });
            queryClient.invalidateQueries({ queryKey: ["question-bank"] });
          }}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  heart: {
    fontSize: 20,
    lineHeight: 22,
    color: colors.again,
  },
  seeInLesson: {
    fontSize: 14,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    borderWidth: 0,
    borderRadius: 0,
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 0,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  prompt: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: fontWeights.bold,
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
  // 44pt minimum tap target -- see the same note in daily-question-body.tsx.
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  optionMark: {
    fontSize: fontSizes.xl,
    color: colors.foreground,
    width: 28,
    textAlign: "center",
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
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  tagText: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  button: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: fontWeights.bold,
    color: colors.primaryForeground,
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
}));
