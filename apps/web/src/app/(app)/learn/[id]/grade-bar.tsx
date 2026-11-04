"use client";

import { useEffect, useRef } from "react";

import type { NextIntervals, ReviewRating } from "@lp/contracts";
import { describeInterval, formatInterval } from "@lp/ui";

const GRADES = [
  { rating: "again", label: "Again", border: "border-again", key: "1" },
  { rating: "hard", label: "Hard", border: "border-hard", key: "2" },
  { rating: "good", label: "Good", border: "border-good", key: "3" },
  { rating: "easy", label: "Easy", border: "border-easy", key: "4" },
] as const satisfies readonly {
  rating: ReviewRating;
  label: string;
  border: string;
  key: string;
}[];

// Paper buttons with dark text in both themes -- "paper on a dark desk"
// (design.md §11), so the grade colours read the same way at night.
const PAPER_BUTTON =
  "flex flex-col items-center gap-0.5 rounded-lg border-[1.5px] bg-paper text-paper-foreground font-extrabold transition-transform active:scale-[0.97] disabled:opacity-50 min-w-[56px] px-1.5 py-[7px] text-sm min-[721px]:min-w-[76px] min-[721px]:px-2.5 min-[721px]:py-2 min-[721px]:text-ui";

/** The wide "Show" button that comes before grading. */
export function ShowButton({ onShow }: { onShow: () => void }) {
  return (
    <button
      type="button"
      onClick={onShow}
      className={`${PAPER_BUTTON} min-w-[190px] border-foreground min-[721px]:min-w-[252px]`}
    >
      Show
      <small className="text-xs font-semibold text-paper-muted-foreground" aria-hidden="true">
        Space
      </small>
    </button>
  );
}

/**
 * Again / Hard / Good / Easy, each with the interval it would schedule
 * under it (design.md §11). The keyboard shortcut (1–4) is in the tooltip.
 */
export function GradeButtons({
  onGrade,
  intervals,
  disabled,
}: {
  onGrade: (rating: ReviewRating) => void;
  /** From the due card; absent while it's loading. */
  intervals?: NextIntervals;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5 min-[721px]:gap-2">
      {GRADES.map((grade) => {
        const days = intervals?.[grade.rating];
        return (
          <button
            key={grade.rating}
            type="button"
            disabled={disabled}
            onClick={() => onGrade(grade.rating)}
            title={`${grade.label} (${grade.key})`}
            aria-keyshortcuts={grade.key}
            aria-label={
              days === undefined ? grade.label : `${grade.label}, ${describeInterval(days)}`
            }
            className={`${PAPER_BUTTON} ${grade.border}`}
          >
            {grade.label}
            <small className="text-xs font-semibold text-paper-muted-foreground" aria-hidden="true">
              {days === undefined ? grade.key : formatInterval(days)}
            </small>
          </button>
        );
      })}
    </div>
  );
}

/** Space reveals, 1–4 grade (design.md §11) -- ignored while typing. */
export function useGradeKeys(
  enabled: boolean,
  { onShow, onGrade }: { onShow: () => void; onGrade: (rating: ReviewRating) => void },
) {
  const latest = useRef({ onShow, onGrade });
  useEffect(() => {
    latest.current = { onShow, onGrade };
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        latest.current.onShow();
        return;
      }
      const grade = GRADES.find((g) => g.key === event.key);
      if (grade) latest.current.onGrade(grade.rating);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
