"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CloseIcon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";

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
  compact = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Centres a narrower panel instead of pinning a wide one near the top. A
   * confirmation is two lines and two buttons; at the default width, high on
   * the page, it reads as a page rather than as a question. */
  compact?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Held in a ref so the effect below depends on `open` alone. A caller whose
  // onClose identity changes between renders -- the normal case for a handler
  // closing over state -- would otherwise re-run the whole effect, and its
  // cleanup pushes focus back to the opener. The overlay would silently steal
  // focus away from whatever the reader was doing inside it.
  //
  // Synced in its own effect rather than assigned during render: effects run
  // in declaration order, so this one has always written the current handler
  // before the one below reads it.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    // Remember who opened it, so focus returns there rather than to the top of
    // the document -- otherwise a keyboard user loses their place entirely.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
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
  }, [open]);

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
      className={`fixed inset-0 z-30 flex justify-center overflow-y-auto bg-scrim px-md pb-lg ${
        compact ? "items-center pt-lg" : "items-start pt-[80px]"
      }`}
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
        className={`w-full rounded-sheet border border-border bg-background p-[30px] pb-lg shadow-card ${
          compact ? "max-w-[26rem]" : "max-w-[36rem]"
        }`}
      >
        <div className="flex items-start justify-between gap-md">
          <h2 id={titleId} className="text-heading leading-[1.25] font-extrabold text-foreground">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-md">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
