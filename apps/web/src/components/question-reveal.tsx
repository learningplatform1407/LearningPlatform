import type { QuestionReveal } from "@lp/api-client";

export const OUTCOME_MARKS = {
  correct: { icon: "✓", label: "Answered correctly", className: "text-success" },
  partial: { icon: "◐", label: "Answered partially correctly", className: "text-warning" },
  incorrect: { icon: "✗", label: "Answered incorrectly", className: "text-danger" },
} as const;

export type Outcome = keyof typeof OUTCOME_MARKS;

/** A graded question with its answer key shown.
 *
 * Extracted from question-bank-list rather than copied: the two-axis colouring
 * below had three near-identical implementations (both bank lists and mobile's
 * exams screen), and the warning that justifies it is only as good as the
 * number of places it lives. The question of the day would have been the
 * fourth caller, which is where that stopped being tolerable.
 *
 * Named `QuestionRevealPanel` so it doesn't collide with the `QuestionReveal`
 * type it renders.
 */
export function QuestionRevealPanel({ reveal }: { reveal: QuestionReveal }) {
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
