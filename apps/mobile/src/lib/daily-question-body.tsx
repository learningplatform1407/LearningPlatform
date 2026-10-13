import type { DailyQuestion } from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { QuestionRevealPanel } from "@/lib/question-reveal";
import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    const body = err.body as { message?: string } | null;
    return body?.message ?? `Request failed with status ${err.status}`;
  }
  return err instanceof Error ? err.message : "Could not save that answer.";
}

function errorCode(err: unknown): string | null {
  if (!(err instanceof ApiClientError)) return null;
  return (err.body as { code?: string } | null)?.code ?? null;
}

/** One day, in whichever of its states applies.
 *
 * Mirrors apps/web/src/components/daily-question-body.tsx, including the thing
 * that matters most: the branch is on `attempt` and `answerable`, both decided
 * by the server, never on a date comparison here. `attempt` is also the only
 * field that ever carries the answer key, so a past day they skipped simply
 * arrives with nothing to reveal.
 */
export function DailyQuestionBody({
  day,
  onAnswered,
}: {
  day: DailyQuestion;
  /** Pins the overlay open: the refetch below changes what `answerable` and
   * `attempt` say, and the host derives its open state from them. */
  onAnswered: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const question = day.question;

  const answer = useMutation({
    mutationFn: (questionId: string) => getApiClient().answerDailyQuestion(questionId, selected),
    onSuccess: () => {
      setError(null);
      onAnswered();
      queryClient.invalidateQueries({ queryKey: ["daily-question"] });
    },
    onError: (err) => {
      setError(describeError(err));
      // The day rolled over between render and submit -- an app left open
      // across midnight. Refetch so the next attempt grades against the
      // question that is actually current.
      if (errorCode(err) === "day_rolled_over") {
        setSelected([]);
        queryClient.invalidateQueries({ queryKey: ["daily-question"] });
      }
    },
  });

  if (!question) {
    return <Text style={styles.hint}>There is no question today. Check back tomorrow.</Text>;
  }

  if (day.attempt) {
    return (
      <View style={styles.body}>
        <Text style={styles.prompt}>{question.prompt}</Text>
        <QuestionRevealPanel reveal={day.attempt} />
      </View>
    );
  }

  if (!day.answerable) {
    // A past day they never answered, or today's question withdrawn. The
    // prompt and options show, but there is no answer control and no key --
    // the server sent none. Questions are shared with the exam pool, so
    // revealing one here would burn it for them in a future quiz.
    return (
      <View style={styles.body}>
        <Text style={styles.prompt}>{question.prompt}</Text>
        <View style={styles.optionList}>
          {question.options.map((option) => (
            <Text key={option.id} style={styles.closedOption}>
              {option.text}
            </Text>
          ))}
        </View>
        <Text style={styles.hint}>This day has closed, so it can no longer be answered.</Text>
      </View>
    );
  }

  const isSingle = question.kind === "single";

  function toggle(optionId: string) {
    if (isSingle) {
      setSelected([optionId]);
      return;
    }
    setSelected((previous) =>
      previous.includes(optionId)
        ? previous.filter((id) => id !== optionId)
        : [...previous, optionId],
    );
  }

  const disabled = selected.length === 0 || answer.isPending;

  return (
    <View style={styles.body}>
      <Text style={styles.prompt}>{question.prompt}</Text>

      <View style={styles.optionList}>
        {question.options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={styles.optionRow}
              onPress={() => toggle(option.id)}
              accessibilityRole={isSingle ? "radio" : "checkbox"}
              accessibilityState={{ checked }}
            >
              <Text style={styles.optionMark}>
                {isSingle ? (checked ? "●" : "○") : checked ? "☑" : "☐"}
              </Text>
              <Text style={styles.optionText}>{option.text}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.meta}>
        {isSingle ? "Single answer" : "Multiple answers"} · {question.points_possible} points ·{" "}
        {question.difficulty}
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={() => answer.mutate(question.id)}
        disabled={disabled}
        accessibilityRole="button"
      >
        {answer.isPending ? (
          <ActivityIndicator color={colors.foreground} />
        ) : (
          <Text style={styles.buttonText}>Check answer</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
  },
  prompt: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
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
  closedOption: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  meta: {
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
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
});
