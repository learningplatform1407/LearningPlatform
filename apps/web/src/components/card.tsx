import type { ComponentPropsWithoutRef, ElementType } from "react";

interface CardOwnProps {
  /** Adds a hover lift for cards that are themselves a link/button. */
  interactive?: boolean;
  className?: string;
}

type CardProps<T extends ElementType> = CardOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps | "as"> & { as?: T };

// Renders as a plain <div> by default; pass as={Link} (or "a", "button", ...)
// to make the whole card itself the interactive element, matching how the
// Learn hub's nav cards already work.
//
// In the quiet-book design most lists are ruled rows rather than boxes, so a
// Card is for things that genuinely sit on the page: tiles, covers, tools.
// It stays on the page colour (not `paper`), because its contents use the
// themed text colours -- light `paper` would hide them in dark mode.
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
      className={`rounded-xl border border-border ${
        interactive
          ? "transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-notch"
          : ""
      } ${className}`}
      {...(props as Record<string, unknown>)}
    />
  );
}
