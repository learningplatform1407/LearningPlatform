import { useRef } from "react";
import type { GestureResponderEvent } from "react-native";

/**
 * Swipe between the lesson's tabs (design.md §13), with the web's
 * thresholds: one finger, more than 90px sideways in under 700ms, vertical
 * drift under 45% of the horizontal. Returns touch handlers to spread on the
 * screen's root view -- they only watch, never claim the gesture, so
 * vertical scrolling and taps are untouched. `onSwipe(-1)` means "previous
 * tab". Panels and sheets are Modals, which get their own touches, so they
 * are excluded without a check here.
 */
export function useTabSwipe(enabled: boolean, onSwipe: (direction: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart: (event: GestureResponderEvent) => {
      const { touches, pageX, pageY, timestamp } = event.nativeEvent;
      start.current = enabled && touches.length <= 1 ? { x: pageX, y: pageY, t: timestamp } : null;
    },
    onTouchEnd: (event: GestureResponderEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const { pageX, pageY, timestamp } = event.nativeEvent;
      const dx = pageX - from.x;
      const dy = pageY - from.y;
      if (timestamp - from.t < 700 && Math.abs(dx) > 90 && Math.abs(dy) < Math.abs(dx) * 0.45) {
        onSwipe(dx > 0 ? -1 : 1);
      }
    },
  };
}
