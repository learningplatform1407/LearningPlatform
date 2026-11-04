import type { ReactNode } from "react";

/** The design's header block: a small uppercase kicker naming where you
 * are, then the page title (design.md §2-3). `actions` sit to the right of
 * the title and wrap under it on narrow screens. */
export function PageHeader({
  kicker,
  title,
  actions,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  /** Anything that belongs to the header under the title (a subtitle). */
  children?: ReactNode;
}) {
  return (
    <header className="pt-[30px] pb-1.5">
      {kicker && (
        <p className="m-0 text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
          {kicker}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-md gap-y-sm">
        <h1 className="mt-1.5 mb-1 text-[clamp(26px,4vw,34px)] leading-[1.15] font-extrabold text-foreground">
          {title}
        </h1>
        {actions && <div className="flex flex-wrap items-center gap-sm">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
