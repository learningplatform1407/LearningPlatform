"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuestionBankItem, QuestionReveal, TopicFilter } from "@lp/api-client";
import { useState } from "react";

import { Button } from "@/components/button";
import { Tag } from "@/components/chip";
import { OptionChoice, OUTCOME_MARKS, QuestionRevealPanel } from "@/components/question-reveal";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

/**
 * Marks a question the reader has attempted before. Outcome-coloured rather
 * than a bare tick: "you have seen this and got it wrong" is the useful signal
 * when deciding what to revise, and a plain tick would hide it.
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
  const { t } = useI18n();
  const mark = OUTCOME_MARKS[outcome];
  const tries =
    attemptCount !== undefined && attemptCount > 1
      ? t("questions.attempts", { count: attemptCount })
      : "";
  return (
    <span
      className={`flex shrink-0 items-center gap-xs text-xs font-bold ${mark.className}`}
      aria-label={`${t("questions.scoreLabel", {
        outcome: t(`questions.answered.${outcome}`),
        awarded: pointsAwarded,
        possible: pointsPossible,
      })}${tries}`}
    >
      <span aria-hidden="true">{mark.icon}</span>
      <span>
        {pointsAwarded}/{pointsPossible}
      </span>
      {attemptCount !== undefined && attemptCount > 1 && (
        <span className="text-muted-foreground">
          {t("questions.tries", { count: attemptCount })}
        </span>
      )}
    </span>
  );
}

function QuestionCard({
  question,
  onAnswered,
  onSeeInLesson,
}: {
  question: QuestionBankItem;
  onAnswered: () => void;
  onSeeInLesson?: SeeInLesson;
}) {
  const { t } = useI18n();
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
        ? getBrowserApiClient().favouriteQuestion(question.id)
        : getBrowserApiClient().unfavouriteQuestion(question.id),
    onError: (_error, on) => {
      setFavourite(!on);
      setError(t("questions.favouriteFailed"));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["question-bank"] }),
  });

  const answer = useMutation({
    mutationFn: () => getBrowserApiClient().answerBankQuestion(question.id, selected),
    onSuccess: (result) => {
      setReveal(result);
      onAnswered();
    },
    onError: () => setError(t("questions.answerFailed")),
  });

  function toggle(optionId: string) {
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
    <li
      id={questionElementId(question.id)}
      className="scroll-mt-[96px] border-t border-border py-[26px]"
    >
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <p className="font-bold text-foreground">{question.prompt}</p>
        <span className="flex shrink-0 items-center gap-3">
          {latest && (
            <ProgressMark
              outcome={latest.outcome}
              pointsAwarded={latest.points_awarded}
              pointsPossible={latest.points_possible}
              // Only the stored row knows the count; a fresh reveal does not
              // carry one, and inventing "+1" would be a guess.
              attemptCount={question.progress?.attempt_count}
            />
          )}
          <button
            type="button"
            aria-label={t("questions.favourite")}
            aria-pressed={favourite}
            title={favourite ? t("questions.removeFavourite") : t("questions.addFavourite")}
            onClick={() => {
              setError(null);
              setFavourite(!favourite);
              favouriteMutation.mutate(!favourite);
            }}
            className="text-[18px] leading-none text-again"
          >
            {favourite ? "♥" : "♡"}
          </button>
        </span>
      </div>

      {reveal ? (
        <QuestionRevealPanel reveal={reveal} />
      ) : (
        <ul>
          {question.options.map((option, index) => (
            <li key={option.id}>
              <OptionChoice
                name={`bank-${question.id}`}
                kind={question.kind}
                index={index}
                text={option.text}
                checked={selected.includes(option.id)}
                onChange={() => toggle(option.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-xs text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {reveal ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setReveal(null);
              setSelected([]);
            }}
          >
            {t("questions.tryAgain")}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={selected.length === 0 || answer.isPending}
            onClick={() => answer.mutate()}
          >
            {answer.isPending ? t("questions.checking") : t("questions.check")}
          </Button>
        )}
        {/* Shown once checked, like the design: before that the passage
            would give the answer away. */}
        {reveal && onSeeInLesson && reveal.source_quotes && reveal.source_quotes.length > 0 && (
          <button
            type="button"
            onClick={() => onSeeInLesson(question.id, reveal.source_quotes!)}
            className="text-toc font-bold text-accent hover:underline"
          >
            {t("questions.seeInLesson")}
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5 text-caption font-bold text-muted-foreground">
          {question.kind === "single" ? t("questions.single") : t("questions.multiple")} ·{" "}
          {t("questions.points", { count: question.points_possible })} ·{" "}
          {t(`questions.difficulty.${question.difficulty}`)}
          {question.tags.map((tag) => (
            <Tag key={tag.id}>{tag.label}</Tag>
          ))}
        </span>
      </div>
    </li>
  );
}

/** Jump to the passages a checked question came from. */
export type SeeInLesson = (questionId: string, quotes: string[]) => void;

/** The element a question renders as, so a "back to quizzes" can return to it. */
export function questionElementId(questionId: string): string {
  return `question-${questionId}`;
}

/**
 * Browse — and answer — published questions. Answering here records progress
 * like any other attempt and is repeatable: the bank is for study, not
 * assessment.
 */
export function QuestionBankList({
  filter,
  unassigned,
  emptyMessage,
  onSeeInLesson,
  favourites,
}: {
  filter?: TopicFilter;
  unassigned?: boolean;
  /** Only the learner's favourites. */
  favourites?: boolean;
  emptyMessage?: string;
  /** Offered inside a lesson only, where there is a lesson to show. */
  onSeeInLesson?: SeeInLesson;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const questions = useQuery({
    queryKey: ["question-bank", filter ?? null, unassigned ?? false, favourites ?? false],
    queryFn: () => getBrowserApiClient().listQuestionBank({ ...filter, unassigned, favourites }),
  });
  const total = useQuery({
    queryKey: ["question-bank-total", filter ?? null],
    queryFn: () => getBrowserApiClient().getQuizAvailableCount(filter),
    // The unassigned bucket and the favourites have no equivalent count
    // endpoint, and there the list is the whole truth anyway.
    enabled: !unassigned && !favourites,
  });

  if (questions.isPending) {
    return <p className="text-sm text-muted-foreground">{t("questions.loading")}</p>;
  }
  if (questions.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("questions.loadFailed")}
      </p>
    );
  }
  if (questions.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage ?? t("questions.empty")}</p>;
  }

  const shown = questions.data.length;
  const totalCount = total.data?.available;

  return (
    <>
      <p className="text-sm font-semibold text-muted-foreground">
        {totalCount !== undefined && totalCount > shown
          ? t("questions.showing", { shown, total: totalCount })
          : t("questions.count", { count: shown })}
      </p>
      <ul className="mt-sm border-b border-border">
        {questions.data.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            onSeeInLesson={onSeeInLesson}
            onAnswered={() => {
              // Answering moves the counts in the tree above it, and the
              // stored progress behind every list this question appears in —
              // the same question shows in both its lesson and the bank.
              queryClient.invalidateQueries({ queryKey: ["question-bank-tree"] });
              queryClient.invalidateQueries({ queryKey: ["question-bank"] });
            }}
          />
        ))}
      </ul>
    </>
  );
}
