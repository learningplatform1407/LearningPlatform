"use client";

import { useEffect, useRef } from "react";

import type { ReviewRating } from "@lp/contracts";

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
 * Again / Hard / Good / Easy. The design shows the next interval under each
 * button; the API only tells us the interval *after* grading, so the hint
 * line carries the keyboard shortcut instead, and the interval is announced
 * once the grade lands.
 */
export function GradeButtons({
  onGrade,
  disabled,
}: {
  onGrade: (rating: ReviewRating) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5 min-[721px]:gap-2">
      {GRADES.map((grade) => (
        <button
          key={grade.rating}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(grade.rating)}
          className={`${PAPER_BUTTON} ${grade.border}`}
        >
          {grade.label}
          <small className="text-xs font-semibold text-paper-muted-foreground" aria-hidden="true">
            {grade.key}
          </small>
        </button>
      ))}
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
