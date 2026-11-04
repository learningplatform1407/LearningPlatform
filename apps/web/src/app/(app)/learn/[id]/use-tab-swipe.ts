"use client";

import { useEffect, useRef } from "react";

/** Elements a swipe may not start in: drawers, panels, the bottom bar and
 * the cards overlay scroll or drag on their own (design.md §13). */
export const NO_SWIPE_ATTR = "data-no-swipe";

/**
 * Swipe between the lesson's tabs on touch screens (design.md §13): one
 * finger, more than 90px sideways in under 700ms, with vertical drift under
 * 45% of the horizontal. Ignored while pinch-zoomed, since a sideways drag
 * then pans the zoomed page. `onSwipe(-1)` means "previous tab".
 */
export function useTabSwipe(enabled: boolean, onSwipe: (direction: -1 | 1) => void) {
  const latest = useRef(onSwipe);
  useEffect(() => {
    latest.current = onSwipe;
  });

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number; t: number } | null = null;

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      const zoomed = (window.visualViewport?.scale ?? 1) > 1.01;
      start =
        event.touches.length === 1 && touch && !zoomed && !target?.closest(`[${NO_SWIPE_ATTR}]`)
          ? { x: touch.clientX, y: touch.clientY, t: Date.now() }
          : null;
    }

    function onTouchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const quick = Date.now() - start.t < 700;
      start = null;
      if (quick && Math.abs(dx) > 90 && Math.abs(dy) < Math.abs(dx) * 0.45) {
        latest.current(dx > 0 ? -1 : 1);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled]);
}
