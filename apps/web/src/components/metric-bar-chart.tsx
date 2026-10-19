/**
 * A labeled multi-row percentage-bar comparison — for metrics like exam
 * average and question accuracy that are naturally compared side by side,
 * unlike ProgressBar's single completion bar. Reuses ProgressBar's bar-fill
 * technique (role="progressbar", width: {percent}%) but with a fixed-width
 * label column and no "done" color threshold, since these are comparison
 * metrics rather than completion.
 *
 * A null percent renders an empty track and "No data yet" instead of a
 * number — same null-is-not-zero posture as ProgressBar/computeBankStatsRates.
 */
export function MetricBarChart({
  metrics,
}: {
  metrics: { label: string; percent: number | null }[];
}) {
  return (
    <div className="flex flex-col gap-sm rounded-md border border-border p-md">
      {metrics.map((metric) => {
        const rounded = metric.percent === null ? null : Math.round(metric.percent);
        return (
          <div key={metric.label} className="flex items-center gap-sm">
            <span className="w-32 shrink-0 text-sm text-muted-foreground">{metric.label}</span>
            <div
              role="progressbar"
              aria-valuenow={rounded ?? undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={metric.label}
              className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            >
              {rounded !== null && (
                <div className="h-full rounded-full bg-primary" style={{ width: `${rounded}%` }} />
              )}
            </div>
            <span className="w-20 shrink-0 text-right text-sm text-foreground">
              {rounded === null ? "No data yet" : `${rounded}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
