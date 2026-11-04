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

/** A static, non-interactive chip -- a tag or a count. */
export function Tag({ className = "", ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-bold text-muted-foreground ${className}`}
      {...props}
    />
  );
}
