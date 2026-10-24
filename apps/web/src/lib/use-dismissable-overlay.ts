"use client";

import { useEffect } from "react";

/** Shared behavior for a dismissable overlay (an off-canvas drawer, not
 * Modal's centered dialog, which already has its own slightly richer
 * version of this -- including returning focus to the opener -- and stays
 * on its own to avoid touching an already-tested component for this):
 * locks background scroll while open and calls `onClose` on Escape. Visual
 * chrome (backdrop, panel, close button) stays with each caller, since a
 * left-edge drawer and a right-edge drawer share no layout, only this
 * behavior. */
export function useDismissableOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
}
