import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondary: "border border-border bg-background text-foreground hover:bg-muted",
  // Solid fill, like primary -- a destructive action should read as strongly
  // as the main call to action, not blend in with secondary/outline buttons.
  danger: "bg-danger text-danger-foreground shadow-sm hover:bg-danger/90",
  // No -foreground token exists for these two (only --color-danger has one),
  // so a solid fill isn't available -- a tinted background instead of
  // danger's old plain border+text treatment, so they're still clearly a
  // step up from secondary.
  warning: "border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20",
  success: "border border-success/30 bg-success/10 text-success hover:bg-success/20",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// A thin className-composing wrapper, not a new abstraction over <button> —
// existing getByRole("button", { name }) queries keep working unchanged.
// Centralizes the focus ring fix and hover treatment so both apply
// consistently everywhere instead of being copy-pasted per call site.
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-lg px-md py-sm text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
