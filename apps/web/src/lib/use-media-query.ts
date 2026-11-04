"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Whether a media query matches, kept live. The server (and hydration)
 * assume `serverDefault`, then the real value takes over -- used where a
 * control must exist exactly once and its *position* depends on the
 * viewport, which CSS alone can't do without rendering it twice. */
export function useMediaQuery(query: string, serverDefault = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}

/** The design's narrow-screen breakpoint (design.md §13). */
export const WIDE_QUERY = "(min-width: 721px)";
