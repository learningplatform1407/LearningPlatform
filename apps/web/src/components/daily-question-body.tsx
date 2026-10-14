"use client";

import type { DailyQuestion } from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/button";
import { QuestionRevealPanel } from "@/components/question-reveal";
import { getBrowserApiClient } from "@/lib/api-client.browser";

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
 * The branch is on `attempt` and `answerable`, both decided by the server --
 * never on a date comparison here. `attempt` is also the only field that ever
 * carries the answer key, so "reveal it iff they answered" is not a rule this
 * component has to remember: there is nothing to reveal until the server
 * decides there is.
 */
export function DailyQuestionBody({
  day,
  onAnswered,
}: {
  day: DailyQuestion;
  /** Pins the overlay open, since the refetch below changes what `answerable`
   * and `attempt` say and the host derives its open state from them. */
  onAnswered: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const question = day.question;

  const answer = useMutation({
    mutationFn: (questionId: string) =>
      getBrowserApiClient().answerDailyQuestion(questionId, selected),
    onSuccess: () => {
      setError(null);
      // Before the invalidation, so the overlay is already pinned open by the
      // time the refetched day arrives saying it is no longer answerable.
      onAnswered();
      queryClient.invalidateQueries({ queryKey: ["daily-question"] });
    },
    onError: (err) => {
      setError(describeError(err));
      // The day rolled over between render and submit -- someone left the
      // form open across midnight. Refetch so the next attempt grades against
      // the question that is actually current, rather than failing forever
      // against a stale one.
      if (errorCode(err) === "day_rolled_over") {
        setSelected([]);
        queryClient.invalidateQueries({ queryKey: ["daily-question"] });
      }
    },
  });

  if (!question) {
    return (
      <p className="text-sm text-muted-foreground">
        There is no question today. Check back tomorrow.
      </p>
    );
  }

  if (day.attempt) {
    return (
      <>
        <p className="text-sm font-medium text-foreground">{question.prompt}</p>
        <QuestionRevealPanel reveal={day.attempt} />
      </>
    );
  }

  if (!day.answerable) {
    // A past day they never answered, or today's question withdrawn. The
    // prompt and options show, but there is no answer control and no key --
    // the server sent none. Questions are shared with the exam pool, so
    // revealing one here would burn it for them in a future quiz.
    return (
      <>
        <p className="text-sm font-medium text-foreground">{question.prompt}</p>
        <ul className="mt-sm flex flex-col gap-xs">
          {question.options.map((option) => (
            <li key={option.id} className="text-sm text-muted-foreground">
              {option.text}
            </li>
          ))}
        </ul>
        <p className="mt-md text-xs text-muted-foreground">
          This day has closed, so it can no longer be answered.
        </p>
      </>
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

  return (
    <>
      <p className="text-sm font-medium text-foreground">{question.prompt}</p>
      <ul className="mt-sm flex flex-col gap-xs">
        {question.options.map((option) => (
          <li key={option.id}>
            <label className="flex items-center gap-xs text-sm text-foreground">
              <input
                type={isSingle ? "radio" : "checkbox"}
                name={`qotd-${question.id}`}
                checked={selected.includes(option.id)}
                onChange={() => toggle(option.id)}
              />
              {option.text}
            </label>
          </li>
        ))}
      </ul>

      <p className="mt-sm text-xs text-muted-foreground">
        {isSingle ? "Single answer" : "Multiple answers"} · {question.points_possible} points ·{" "}
        {question.difficulty}
      </p>

      {error && (
        <p role="alert" className="mt-sm text-sm text-danger">
          {error}
        </p>
      )}

      <Button
        type="button"
        className="mt-md"
        disabled={selected.length === 0 || answer.isPending}
        onClick={() => answer.mutate(question.id)}
      >
        {answer.isPending ? "Checking..." : "Check answer"}
      </Button>
    </>
  );
}
