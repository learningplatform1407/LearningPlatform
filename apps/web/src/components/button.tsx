import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border text-foreground hover:bg-muted",
  danger: "border border-border text-danger hover:bg-muted",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// A thin className-composing wrapper, not a new abstraction over <button> —
// existing getByRole("button", { name }) queries keep working unchanged.
// Centralizes the focus ring fix and hover treatment so both apply
// consistently everywhere instead of being copy-pasted per call site.
export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-md px-md py-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
