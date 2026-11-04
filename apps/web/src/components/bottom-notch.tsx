import type { ReactNode } from "react";

/** A notch glued to the bottom edge, centred (the Review bar, design.md
 * §11): open at the bottom, rounded on top, padded past the home indicator.
 * Fixed, so it floats over the page rather than taking space in it; pages
 * that show one keep ~140px of bottom padding so their last line clears it. */
export function BottomNotch({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role={label ? "region" : undefined}
      aria-label={label}
      className={`fixed bottom-0 left-1/2 z-[55] flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-end gap-1.5 rounded-t-notch border border-b-0 border-border bg-background px-2 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))] shadow-bar min-[721px]:gap-2.5 min-[721px]:px-3 ${className}`}
    >
      {children}
    </div>
  );
}
