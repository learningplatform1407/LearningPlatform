"use client";

import { useState } from "react";

/**
 * A disclosure row for the book → chapter → sub-chapter → lesson tree.
 *
 * Generalised from the private row in learn/review/page.tsx so the Question
 * Bank and the Exams topic picker render the structure students already
 * navigate. Each row owns its open state, so several branches can be open at
 * once — unlike the library page's single-open accordion.
 *
 * `badge` is whatever belongs on the right: a due count on the review page, a
 * progress count in the bank, a checkbox in the topic picker. It sits outside
 * the toggle button so an interactive badge is not nested in a button.
 */
export function ExpandableRow({
  title,
  badge,
  defaultExpanded = false,
  children,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <li className="rounded-md border border-border">
      <div className="flex w-full items-center gap-sm px-md py-sm">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex flex-1 items-center justify-between gap-sm text-left hover:underline"
        >
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{expanded ? "▲" : "▼"}</span>
        </button>
        {badge}
      </div>
      {expanded && <div className="border-t border-border px-md py-md">{children}</div>}
    </li>
  );
}
