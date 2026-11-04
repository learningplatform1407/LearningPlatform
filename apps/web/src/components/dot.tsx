import type { ButtonHTMLAttributes } from "react";

const SIZE_CLASSES = {
  md: "h-[38px] w-[38px]",
  sm: "h-9 w-9",
  xs: "h-8 w-8",
} as const;

export interface DotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** md = 38px (top-notch dots), sm = 36px (review bar), xs = 32px (narrow). */
  size?: keyof typeof SIZE_CLASSES;
  /** Required: a dot shows only an icon or a glyph. */
  "aria-label": string;
}

/** The design's round icon button. Pass `aria-pressed` for a toggle -- the
 * pressed state (ink fill) is styled off that attribute, so the visual and
 * the accessible state can't drift apart. */
export function Dot({ size = "md", className = "", type = "button", ...props }: DotProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-background p-0 text-sm font-bold text-foreground shadow-dot transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-30 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
