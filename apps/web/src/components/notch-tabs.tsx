"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const VARIANT_CLASSES = {
  // The top notch: glued to the top edge, open at the top.
  top: "w-[min(480px,100%)] rounded-b-notch border-t-0 px-3.5 pt-1.5 pb-2",
  // The smaller copy at the top of the side panel.
  panel: "w-[min(250px,100%)] rounded-b-[20px] border-t-0 px-3 pt-1.5 pb-2",
} as const;

/**
 * Equal-width tabs over a sliding pill, inside a notch (design.md §4).
 *
 * The pill is positioned from the active button's measured offsetLeft /
 * offsetWidth rather than from its index, so labels of different lengths
 * still get an exactly-fitting pill; a ResizeObserver re-measures when fonts
 * load or the notch resizes. `header` renders above the tab row, inside the
 * same notch (the lesson title line).
 */
export function NotchTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
  variant = "top",
  header,
  className = "",
}: {
  tabs: readonly { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  label: string;
  variant?: keyof typeof VARIANT_CLASSES;
  header?: ReactNode;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number; top: number; height: number }>();

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    function measure() {
      const button = row?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (!button) return;
      setPill({
        left: button.offsetLeft,
        width: button.offsetWidth,
        top: button.offsetTop,
        height: button.offsetHeight,
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div
      className={`pointer-events-auto relative flex flex-col border border-border bg-background shadow-notch ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {header}
      <div ref={rowRef} role="tablist" aria-label={label} className="relative flex">
        {pill && (
          <span
            aria-hidden="true"
            className="absolute rounded-lg bg-muted transition-[transform,width] duration-[320ms] ease-pill"
            style={{
              top: pill.top,
              height: pill.height,
              width: pill.width,
              transform: `translateX(${pill.left}px)`,
            }}
          />
        )}
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === active}
            onClick={() => onChange(tab.key)}
            className="relative z-[1] flex-1 rounded-lg px-1 py-[9px] text-ui font-semibold text-muted-foreground transition-colors hover:text-foreground aria-selected:font-bold aria-selected:text-foreground"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
