import type { ButtonHTMLAttributes } from "react";

/** A small pill filter/toggle (the design's "chip"). Pass `aria-pressed`
 * when it toggles; the selected look is styled off that attribute. */
export function Chip({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-[5px] text-caption font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 aria-pressed:border-foreground aria-pressed:text-foreground ${className}`}
      {...props}
    />
  );
}

/** A static, non-interactive chip -- a tag or a count. `active` tints it
 * with the accent, for a count that asks for attention (cards due). */
export function Tag({
  className = "",
  active = false,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${
        active
          ? "border-transparent bg-cloze-bg text-accent"
          : "border-border text-muted-foreground"
      } ${className}`}
      {...props}
    />
  );
}
