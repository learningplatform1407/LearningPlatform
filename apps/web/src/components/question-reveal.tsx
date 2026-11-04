import type { QuestionReveal } from "@lp/api-client";

export const OUTCOME_MARKS = {
  correct: { icon: "✓", label: "Answered correctly", className: "text-good" },
  partial: { icon: "◐", label: "Answered partially correctly", className: "text-hard" },
  incorrect: { icon: "✗", label: "Answered incorrectly", className: "text-again" },
} as const;

export type Outcome = keyof typeof OUTCOME_MARKS;

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** The design's option letter: a 28px circle (design.md §12). */
export const LETTER_CIRCLE =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-border text-caption font-extrabold";

const OPTION_ROW = "flex w-full items-start gap-3 border-b border-border py-2.5 text-left";

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
    <div className="mt-xs">
      <ul>
        {reveal.options.map((option, index) => {
          // Two independent axes: whether the option belongs in the answer
          // (in_key) and whether the student earned its point
          // (classified_correctly). Avoiding a wrong option scores, so
          // collapsing these would call a wrong option "right".
          const circle = option.in_key
            ? "border-good bg-good text-white"
            : option.selected
              ? "border-again bg-again text-white"
              : "";
          const earned = option.classified_correctly ? "you got this right" : "you missed this";
          return (
            <li key={option.id} className={OPTION_ROW}>
              <span className={`${LETTER_CIRCLE} ${circle}`}>{optionLetter(index)}</span>
              <span className="flex-1">
                <span className="text-foreground">
                  {option.text}
                  <span className="sr-only">
                    {option.selected ? ", your choice" : ""}
                    {option.in_key ? ", in the answer" : ""}, {earned}
                  </span>
                </span>
                <span className="mt-1 block text-toc text-muted-foreground">
                  <b className={option.in_key ? "text-good" : "text-again"}>
                    {option.in_key ? "True." : "False."}
                  </b>
                  {option.rationale && <> {option.rationale}</>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {reveal.explanation && (
        <p className="mt-sm text-toc text-muted-foreground">{reveal.explanation}</p>
      )}
      <p className="mt-sm text-sm font-bold text-foreground">
        {reveal.outcome} — {reveal.points_awarded}/{reveal.points_possible} points
      </p>
    </div>
  );
}

/** One answerable option: a native radio/checkbox (kept for keyboard and
 * screen readers) visually replaced by the design's letter circle. */
export function OptionChoice({
  name,
  kind,
  index,
  text,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  kind: "single" | "multiple" | string;
  index: number;
  text: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`${OPTION_ROW} cursor-pointer`}>
      <input
        type={kind === "single" ? "radio" : "checkbox"}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`${LETTER_CIRCLE} transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent`}
      >
        {optionLetter(index)}
      </span>
      <span className="flex-1 pt-0.5 text-foreground">{text}</span>
    </label>
  );
}
