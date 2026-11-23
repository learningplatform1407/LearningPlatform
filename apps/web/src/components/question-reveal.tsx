import type { QuestionReveal } from "@lp/api-client";

import { useI18n } from "@/lib/i18n";

export const OUTCOME_MARKS = {
  correct: {
    icon: "✓",
    className: "text-good",
    edge: "border-l-good",
  },
  partial: {
    icon: "◐",
    className: "text-hard",
    edge: "border-l-hard",
  },
  incorrect: {
    icon: "✗",
    className: "text-again",
    edge: "border-l-again",
  },
} as const;

export type Outcome = keyof typeof OUTCOME_MARKS;

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * The design's option letter (design.md §12), at 32px rather than its 28px.
 *
 * One constant for both the answerable option and the graded one, so the
 * two states of a question are the same size: at 28px with a 13px letter,
 * picking an answer read as a much smaller control than the explanation it
 * turned into, which is the mismatch this size fixes. Anything that grows
 * the row has to grow both halves, which is what sharing it guarantees.
 */
export const LETTER_CIRCLE =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-border text-sm font-extrabold";

export const OPTION_ROW = "flex w-full items-start gap-3 border-b border-border py-3 text-left";

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
  const { t } = useI18n();
  const mark = OUTCOME_MARKS[reveal.outcome];
  // A framed block with its own heading, so the answers read as a separate
  // part from the question above them and from the next question below.
  return (
    <div className={`mt-xs rounded-lg border-l-4 bg-muted px-md py-sm ${mark.edge}`}>
      <p className={`text-xs font-extrabold tracking-[0.12em] uppercase ${mark.className}`}>
        {t("questions.answersHeading", {
          outcome: t(`questions.outcome.${reveal.outcome}`),
          awarded: reveal.points_awarded,
          possible: reveal.points_possible,
        })}
      </p>
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
          const earned = option.classified_correctly
            ? t("questions.gotRight")
            : t("questions.missed");
          return (
            <li key={option.id} className={OPTION_ROW}>
              <span className={`${LETTER_CIRCLE} ${circle}`}>{optionLetter(index)}</span>
              <span className="flex-1">
                <span className="text-foreground">
                  {option.text}
                  <span className="sr-only">
                    {option.selected ? t("questions.yourChoice") : ""}
                    {option.in_key ? t("questions.inAnswer") : ""}, {earned}
                  </span>
                </span>
                <span className="mt-1 block text-ui text-muted-foreground">
                  <b className={option.in_key ? "text-good" : "text-again"}>
                    {option.in_key ? t("questions.true") : t("questions.false")}
                  </b>
                  {option.rationale && <> {option.rationale}</>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {reveal.explanation && (
        <p className="mt-sm text-ui text-muted-foreground">{reveal.explanation}</p>
      )}
    </div>
  );
}

/** One answerable option: a native radio/checkbox (kept for keyboard and
 * screen readers) visually replaced by the design's letter circle.
 *
 * `keyHint` is the number key that picks this option (web only, see
 * use-question-keys), shown as the control's tooltip so the shortcut is
 * discoverable from the option itself.
 */
export function OptionChoice({
  name,
  kind,
  index,
  text,
  checked,
  disabled,
  keyHint,
  onChange,
}: {
  name: string;
  kind: "single" | "multiple" | string;
  index: number;
  text: string;
  checked: boolean;
  disabled?: boolean;
  keyHint?: string;
  onChange: () => void;
}) {
  return (
    <label className={`${OPTION_ROW} cursor-pointer`} title={keyHint}>
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
      <span className="flex-1 pt-[3px] text-foreground">{text}</span>
    </label>
  );
}

/** An option with no answer to give and none to reveal: a past day's
 * question of the day, closed before it was answered. Same row and circle as
 * the two live states, so the three don't read as three different designs. */
export function OptionReadOnly({ index, text }: { index: number; text: string }) {
  return (
    <span className={OPTION_ROW}>
      <span aria-hidden="true" className={`${LETTER_CIRCLE} text-muted-foreground`}>
        {optionLetter(index)}
      </span>
      <span className="flex-1 pt-[3px] text-muted-foreground">{text}</span>
    </span>
  );
}
