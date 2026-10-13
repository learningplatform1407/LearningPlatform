"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The first overlay in this app, so it is shared from the start.
 *
 * Nothing here previously rendered a dialog: no portal, no focus handling, no
 * Escape listener, and a z-index ceiling of `z-20` (the selection toolbar in
 * the lesson reader). Those choices are therefore made here rather than
 * inherited, and the next overlay should use this rather than repeat them.
 *
 * **Known limitation: there is no focus trap.** `aria-modal="true"` already
 * tells assistive technology to ignore the rest of the page, so the screen
 * reader case is covered. What remains is that a sighted keyboard user can
 * Tab past the last control into the page behind. A real trap needs
 * tabbable-node queries, Tab/Shift-Tab interception and mutation handling --
 * about sixty lines, with no dependency in the repo to supply it -- so it is
 * deliberately left out and written down instead. Worth revisiting when a
 * second overlay lands.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Remember who opened it, so focus returns there rather than to the top of
    // the document -- otherwise a keyboard user loses their place entirely.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    // The Learn page scrolls behind the overlay otherwise.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  // Rendering null when closed also means `document` is guaranteed to exist by
  // the time the portal mounts -- an overlay only ever opens from an
  // interaction, so there is no server pass to guard against.
  if (!open) return null;

  return createPortal(
    // One `fixed` wrapper holding backdrop and panel, so exactly one z-index
    // exists. `z-30` clears the app's `z-20` ceiling. Deliberately a literal:
    // globals.css mirrors packages/ui/src/tokens by hand, and a web-only
    // `--z-modal` would be drift its parity test cannot catch. Note `z-*` is
    // not generated from --spacing-*, unlike widths, so no bracket is needed.
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-foreground/40 p-lg"
      onClick={(event) => {
        // Only a click on the backdrop itself, not one that bubbled up from
        // inside the panel.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Bracket width: --spacing-* shadows the named width scale, so
        // max-w-lg would silently render 24px.
        className="w-full max-w-[36rem] rounded-md border border-border bg-background p-lg shadow-md"
      >
        <div className="flex items-start justify-between gap-md">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md px-sm text-lg text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {/* A bare glyph with an accessible name, the idiom sidebar.tsx
                already uses for its collapse chevrons. */}
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="mt-md">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
