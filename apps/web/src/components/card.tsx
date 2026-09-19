import type { ComponentPropsWithoutRef, ElementType } from "react";

interface CardOwnProps {
  /** Adds a hover-lift shadow and a primary-tinted border, for cards that are themselves a link/button. */
  interactive?: boolean;
  className?: string;
}

type CardProps<T extends ElementType> = CardOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps | "as"> & { as?: T };

// Renders as a plain <div> by default; pass as={Link} (or "a", "button", ...)
// to make the whole card itself the interactive element, matching how the
// Learn hub's nav cards already work.
export function Card<T extends ElementType = "div">({
  as,
  interactive = false,
  className = "",
  ...props
}: CardProps<T>) {
  // TypeScript can't verify arbitrary props against a type-parameterized
  // element at the JSX call site — this is the standard escape hatch for
  // the "polymorphic component" pattern.
  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      // Deliberately no padding/background defaults here (Tailwind's utility
      // precedence is stylesheet-order, not class-string order, so a caller
      // couldn't reliably override e.g. a baked-in bg-background with their
      // own bg-muted) — callers supply padding/background via className.
      className={`rounded-md border border-border shadow-sm ${
        interactive ? "transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md" : ""
      } ${className}`}
      {...(props as Record<string, unknown>)}
    />
  );
}
