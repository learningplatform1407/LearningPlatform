"use client";

import type { DailyQuestion } from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import type { Translator } from "@lp/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/button";
import { DailyFollowing } from "@/components/daily-following";
import { OptionChoice, OptionReadOnly, QuestionRevealPanel } from "@/components/question-reveal";
import {
  QUESTION_CARD_ATTR,
  QuestionKeysHint,
  useQuestionKeys,
} from "@/components/use-question-keys";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

function describeError(t: Translator["t"], err: unknown): string {
  if (err instanceof ApiClientError) {
    const body = err.body as { message?: string } | null;
    return body?.message ?? t("questions.requestFailed", { status: err.status });
  }
  return err instanceof Error ? err.message : t("questions.answerFailed");
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
export function DailyQuestionBody({ day }: { day: DailyQuestion }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const question = day.question;

  const answer = useMutation({
    mutationFn: (questionId: string) =>
      getBrowserApiClient().answerDailyQuestion(questionId, selected),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["daily-question"] });
    },
    onError: (err) => {
      setError(describeError(t, err));
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

  const isSingle = question?.kind === "single";
  const options = question?.options ?? [];
  // The three states below are exclusive; only this one takes the keys.
  const answerable = question !== null && !day.attempt && day.answerable && !answer.isPending;

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

  useQuestionKeys(question?.id ?? "", {
    optionCount: options.length,
    choose: (index) => {
      const option = options[index];
      if (option && answerable) toggle(option.id);
    },
    submit:
      answerable && selected.length > 0 && question ? () => answer.mutate(question.id) : undefined,
  });

  if (!question) {
    return <p className="text-sm text-muted-foreground">{t("daily.noneToday")}</p>;
  }

  if (day.attempt) {
    return (
      <>
        <p className="font-bold text-foreground">{question.prompt}</p>
        <QuestionRevealPanel reveal={day.attempt} />
        {/* Today only: a past day's answers are history, not company. */}
        {day.for_date === day.server_today && <DailyFollowing />}
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
        <p className="font-bold text-foreground">{question.prompt}</p>
        <ul className="mt-sm">
          {question.options.map((option, index) => (
            <li key={option.id}>
              <OptionReadOnly index={index} text={option.text} />
            </li>
          ))}
        </ul>
        <p className="mt-md text-caption text-muted-foreground">{t("daily.closed")}</p>
      </>
    );
  }

  return (
    // The same letter circles and type scale as the question bank, so
    // answering and the explanation that replaces it are one design rather
    // than a small form that turns into a big panel.
    <div {...{ [QUESTION_CARD_ATTR]: question.id }}>
      <p className="font-bold text-foreground">{question.prompt}</p>
      <ul className="mt-sm">
        {question.options.map((option, index) => (
          <li key={option.id}>
            <OptionChoice
              name={`qotd-${question.id}`}
              kind={isSingle ? "single" : "multiple"}
              index={index}
              text={option.text}
              checked={selected.includes(option.id)}
              keyHint={t("questions.chooseKey", { key: index + 1 })}
              onChange={() => toggle(option.id)}
            />
          </li>
        ))}
      </ul>

      <p className="mt-sm text-caption font-bold text-muted-foreground">
        {isSingle ? t("questions.single") : t("questions.multiple")} ·{" "}
        {t("questions.points", { count: question.points_possible })} ·{" "}
        {t(`questions.difficulty.${question.difficulty}`)}
      </p>

      {error && (
        <p role="alert" className="mt-sm text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-md flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={selected.length === 0 || answer.isPending}
          onClick={() => answer.mutate(question.id)}
        >
          {answer.isPending ? t("questions.checking") : t("questions.check")}
        </Button>
        <QuestionKeysHint optionCount={question.options.length} />
      </div>
    </div>
  );
}
