import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  // The design's filled button: ink on page colour, weight 700, radius 10.
  primary: "bg-primary text-primary-foreground hover:bg-primary/85",
  secondary: "border border-border bg-background text-foreground hover:bg-muted",
  // Solid fill, like primary -- a destructive action should read as strongly
  // as the main call to action, not blend in with secondary/outline buttons.
  danger: "bg-danger text-danger-foreground hover:bg-danger/90",
  // Tinted, the same treatment graded cloze gaps get.
  warning: "bg-hard-tint text-hard hover:bg-hard/25",
  success: "bg-good-tint text-good hover:bg-good/25",
  // Text-only, for low-emphasis actions next to a primary one.
  ghost: "text-foreground hover:bg-muted",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// A thin className-composing wrapper, not a new abstraction over <button> —
// existing getByRole("button", { name }) queries keep working unchanged.
// Focus is the global :focus-visible ring (globals.css), not a per-button one.
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-md px-4 py-[9px] text-sm font-bold transition-colors disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
