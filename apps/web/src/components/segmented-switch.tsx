/** A pill of mutually exclusive options (the design's PDF | Text switch, the
 * theme picker). Each segment is a toggle button with `aria-pressed`, inside
 * a labelled group -- the same structure the reader's PDF/Text toggle had
 * before the redesign, so existing role/name queries keep working. */
export function SegmentedSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex h-[38px] items-center rounded-full border border-border bg-background p-[3px] shadow-dot ${className}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="h-[30px] rounded-full px-3 text-caption font-bold text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
