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
    <li className="border-t border-border first:border-t-0">
      <div className="flex w-full items-center gap-sm py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-sm rounded-sm text-left"
        >
          <span
            aria-hidden="true"
            className={`text-lg leading-none font-semibold text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ›
          </span>
          <span className="flex-1 text-toc font-bold text-foreground">{title}</span>
        </button>
        {badge}
      </div>
      {expanded && <div className="pb-md pl-lg">{children}</div>}
    </li>
  );
}
