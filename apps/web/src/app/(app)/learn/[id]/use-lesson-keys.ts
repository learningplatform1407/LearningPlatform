"use client";

import { useEffect, useRef } from "react";

import type { SwatchIndex } from "./lesson-tools";

export interface LessonKeyHandlers {
  swatch: (color: SwatchIndex) => void;
  toggleMarker: () => void;
  eraser: () => void;
  pen: () => void;
  note: () => void;
  explain: () => void;
  undo: () => void;
  clear: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** The lesson's keyboard shortcuts (design.md §10), live only on the Lesson
 * tab and never while the reader is typing. */
export function useLessonKeys(enabled: boolean, handlers: LessonKeyHandlers) {
  // Read through a ref so the listener isn't re-bound on every render.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.altKey) return;
      const h = latest.current;
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        h.undo();
        return;
      }
      if (event.ctrlKey || event.metaKey) return;

      if (/^[1-5]$/.test(key)) h.swatch((Number(key) - 1) as SwatchIndex);
      else if (key === "e") h.toggleMarker();
      else if (key === "r") h.eraser();
      else if (key === "p") h.pen();
      else if (key === "w") h.note();
      else if (key === "q") h.explain();
      else if (key === "z") h.undo();
      else if (key === "escape") h.clear();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
