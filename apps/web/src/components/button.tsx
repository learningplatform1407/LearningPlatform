import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  // The design's filled button: ink on page colour, weight 700, radius 10.
  primary: "border-transparent bg-primary text-primary-foreground hover:bg-primary/85",
  secondary: "border-border bg-background text-foreground hover:bg-muted",
  // Solid fill, like primary -- a destructive action should read as strongly
  // as the main call to action, not blend in with secondary/outline buttons.
  danger: "border-transparent bg-danger text-danger-foreground hover:bg-danger/90",
  // Tinted, the same treatment graded cloze gaps get.
  warning: "border-transparent bg-hard-tint text-hard hover:bg-hard/25",
  success: "border-transparent bg-good-tint text-good hover:bg-good/25",
  // Text-only, for low-emphasis actions next to a primary one.
  ghost: "border-transparent text-foreground hover:bg-muted",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// A thin className-composing wrapper, not a new abstraction over <button> —
// existing getByRole("button", { name }) queries keep working unchanged.
// Focus is the global :focus-visible ring (globals.css), not a per-button one.
// Every variant has a 1px border (transparent unless it shows), so buttons of
// different variants side by side are the same height.
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-md border px-4 py-[9px] text-center text-sm font-bold transition-colors disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
