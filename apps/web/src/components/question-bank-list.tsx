"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuestionBankItem, QuestionReveal, TopicFilter } from "@lp/api-client";
import { useState } from "react";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";

const OUTCOME_MARKS = {
  correct: { icon: "✓", label: "Answered correctly", className: "text-success" },
  partial: { icon: "◐", label: "Answered partially correctly", className: "text-warning" },
  incorrect: { icon: "✗", label: "Answered incorrectly", className: "text-danger" },
} as const;

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
  const mark = OUTCOME_MARKS[outcome];
  const tries = attemptCount !== undefined && attemptCount > 1 ? `, ${attemptCount} attempts` : "";
  return (
    <span
      className={`flex shrink-0 items-center gap-xs text-xs ${mark.className}`}
      aria-label={`${mark.label}, ${pointsAwarded} of ${pointsPossible} points${tries}`}
    >
      <span aria-hidden="true">{mark.icon}</span>
      <span>
        {pointsAwarded}/{pointsPossible}
      </span>
      {attemptCount !== undefined && attemptCount > 1 && (
        <span className="text-muted-foreground">· {attemptCount} tries</span>
      )}
    </span>
  );
}

function Reveal({ reveal }: { reveal: QuestionReveal }) {
  return (
    <div className="mt-sm rounded-md border border-border bg-secondary/40 p-sm">
      <p className="text-sm font-medium text-foreground">
        {reveal.outcome} — {reveal.points_awarded}/{reveal.points_possible} points
      </p>
      <ul className="mt-xs flex flex-col gap-xs">
        {reveal.options.map((option) => (
          <li key={option.id} className="flex items-start gap-sm text-sm">
            {/* Two independent axes: whether the option belongs in the answer
                (in_key) and whether the student earned its point
                (classified_correctly). Avoiding a wrong option scores, so
                collapsing these would call a wrong option "right". */}
            <span
              className={
                option.classified_correctly
                  ? "text-success"
                  : option.selected
                    ? "text-danger"
                    : "text-muted-foreground"
              }
            >
              {option.selected ? "☑" : "☐"}
            </span>
            <span className="flex-1">
              {option.text}
              {option.in_key && (
                <span className="ml-xs text-xs text-muted-foreground">(correct answer)</span>
              )}
              {option.rationale && (
                <span className="block text-xs text-muted-foreground">{option.rationale}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {reveal.explanation && (
        <p className="mt-xs text-xs text-muted-foreground">{reveal.explanation}</p>
      )}
    </div>
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
    mutationFn: () => getBrowserApiClient().answerBankQuestion(question.id, selected),
    onSuccess: (result) => {
      setReveal(result);
      onAnswered();
    },
    onError: () => setError("Could not save that answer."),
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
    <li className="rounded-md border border-border p-md">
      <div className="flex items-start justify-between gap-sm">
        <p className="text-sm font-medium text-foreground">{question.prompt}</p>
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
      </div>
      <ul className="mt-sm flex flex-col gap-xs">
        {question.options.map((option) => (
          <li key={option.id}>
            <label className="flex items-center gap-xs text-sm text-foreground">
              <input
                type={question.kind === "single" ? "radio" : "checkbox"}
                name={`bank-${question.id}`}
                checked={selected.includes(option.id)}
                disabled={reveal !== null}
                onChange={() => toggle(option.id)}
              />
              {option.text}
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-sm flex flex-wrap items-center gap-xs text-xs text-muted-foreground">
        <span>
          {question.kind === "single" ? "Single answer" : "Multiple answers"} ·{" "}
          {question.points_possible} points · {question.difficulty}
        </span>
        {question.tags.map((tag) => (
          <span key={tag.id} className="rounded-md border border-border px-xs py-xs">
            {tag.label}
          </span>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-xs text-sm text-danger">
          {error}
        </p>
      )}

      {reveal ? (
        <>
          <Reveal reveal={reveal} />
          <Button
            type="button"
            variant="secondary"
            className="mt-sm"
            onClick={() => {
              setReveal(null);
              setSelected([]);
            }}
          >
            Try again
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="mt-sm"
          disabled={selected.length === 0 || answer.isPending}
          onClick={() => answer.mutate()}
        >
          {answer.isPending ? "Checking..." : "Check answer"}
        </Button>
      )}
    </li>
  );
}

/**
 * Browse — and answer — published questions. Answering here records progress
 * like any other attempt and is repeatable: the bank is for study, not
 * assessment.
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
    queryFn: () => getBrowserApiClient().listQuestionBank({ ...filter, unassigned }),
  });
  const total = useQuery({
    queryKey: ["question-bank-total", filter ?? null],
    queryFn: () => getBrowserApiClient().getQuizAvailableCount(filter),
    // The unassigned bucket has no equivalent count endpoint, and there the
    // list is the whole truth anyway.
    enabled: !unassigned,
  });

  if (questions.isPending) {
    return <p className="text-sm text-muted-foreground">Loading questions...</p>;
  }
  if (questions.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load questions.
      </p>
    );
  }
  if (questions.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const shown = questions.data.length;
  const totalCount = total.data?.available;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {totalCount !== undefined && totalCount > shown
          ? `Showing ${shown} of ${totalCount} questions`
          : `${shown} question${shown === 1 ? "" : "s"}`}
      </p>
      <ul className="mt-sm flex flex-col gap-sm">
        {questions.data.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
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
