// Threshold for the "done" color, matching the server's
// LESSON_COMPLETION_THRESHOLD (services/api/app/progress/constants.py) —
// kept in sync by eye rather than shared over the wire, since it only
// controls which color a bar renders in, never a completion decision.
const DONE_THRESHOLD = 80;

/**
 * A horizontal completion bar for one Library node (lesson, sub-chapter,
 * chapter, book). Renders nothing when `percent` is null — a node with no
 * eligible lessons has no completion to show, same "nothing to show"
 * treatment BankStatsLine gives a zero-question node.
 */
export function ProgressBar({ percent, label }: { percent: number | null; label?: string }) {
  if (percent === null) return null;
  const rounded = Math.round(percent);
  return (
    <div className="mt-xs flex items-center gap-sm">
      {label && <span className="shrink-0 text-xs text-muted-foreground">{label}</span>}
      <div
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full rounded-full ${rounded >= DONE_THRESHOLD ? "bg-success" : "bg-primary"}`}
          style={{ width: `${rounded}%` }}
        />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{rounded}%</span>
    </div>
  );
}
