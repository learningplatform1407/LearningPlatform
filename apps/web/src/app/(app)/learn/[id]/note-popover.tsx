"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Annotation } from "@lp/contracts";

import { CloseIcon, TrashIcon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";

const WIDTH = 280;
const GAP = 6;
const MARGIN = 8;
/** The textarea grows with the note up to this, then scrolls. */
const MAX_TEXT_HEIGHT = 180;

export function noteBubbleSelector(noteId: string): string {
  return `[data-note-bubble="${CSS.escape(noteId)}"]`;
}

/**
 * An in-text note, in a small window beside its bubble. In-text notes are
 * meant to be short, so this is a pop-up rather than the side panel; a long
 * note scrolls inside it. Saved on blur and on close, only when the text
 * changed -- the same rule as the panel.
 *
 * Follows its bubble while the page scrolls, and closes on Escape or a
 * press anywhere outside it (the bubble included, so a second press on the
 * bubble closes it).
 */
export function NotePopover({
  note,
  onSave,
  onDelete,
  onOpenInNotebook,
  onClose,
}: {
  note: Annotation;
  onSave: (text: string) => void;
  onDelete: () => void;
  onOpenInNotebook: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const saved = useRef(note.note_text ?? "");

  function save() {
    const text = textRef.current?.value ?? "";
    if (text === saved.current) return;
    saved.current = text;
    onSave(text);
  }

  function close() {
    save();
    onClose();
  }

  // Latest `close` for the listeners below, which are attached once.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useLayoutEffect(() => {
    function place() {
      const bubble = document.querySelector(noteBubbleSelector(note.id));
      const panel = panelRef.current;
      if (!bubble || !panel) return;
      const rect = bubble.getBoundingClientRect();
      const height = panel.offsetHeight;
      // Below the bubble, unless that runs off the screen and above fits.
      const below = rect.bottom + GAP;
      const top =
        below + height > window.innerHeight - MARGIN && rect.top - GAP - height >= MARGIN
          ? rect.top - GAP - height
          : below;
      const left = Math.min(
        Math.max(MARGIN, rect.left + rect.width / 2 - WIDTH / 2),
        window.innerWidth - WIDTH - MARGIN,
      );
      setPosition({ top, left: Math.max(MARGIN, left) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [note.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Element;
      if (panelRef.current?.contains(target)) return;
      // Its own bubble toggles it (the page's click handler); closing here
      // too would close and immediately reopen it.
      if (target.closest?.(noteBubbleSelector(note.id))) return;
      closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [note.id]);

  // Grows with the note, then scrolls once it passes MAX_TEXT_HEIGHT.
  function fit() {
    const area = textRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, MAX_TEXT_HEIGHT)}px`;
  }
  useLayoutEffect(fit, []);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("lesson.panel.note")}
      data-no-swipe
      style={{
        width: WIDTH,
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
      className="fixed z-[75] flex flex-col rounded-lg border border-border bg-background shadow-bubble"
    >
      <div className="flex items-center gap-xs border-b border-border py-1 pr-1 pl-md">
        <span className="label-caps flex-1">{t("lesson.panel.note")}</span>
        <button
          type="button"
          aria-label={t("lesson.panel.deleteNote")}
          title={t("lesson.panel.deleteNote")}
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger"
        >
          <TrashIcon size={15} />
        </button>
        <button
          type="button"
          aria-label={t("lesson.panel.closeNote")}
          title={t("lesson.panel.closeNote")}
          onClick={close}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CloseIcon size={15} />
        </button>
      </div>
      <textarea
        ref={textRef}
        aria-label={t("lesson.panel.noteText")}
        placeholder={t("lesson.panel.placeholder")}
        defaultValue={note.note_text ?? ""}
        // A brand-new note is opened to be written in.
        autoFocus={!note.note_text}
        rows={2}
        onInput={fit}
        onBlur={save}
        style={{ maxHeight: MAX_TEXT_HEIGHT }}
        className="resize-none overflow-y-auto border-0 bg-transparent px-md py-sm text-sm leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          save();
          onOpenInNotebook();
        }}
        className="self-start px-md pt-0.5 pb-sm text-caption font-bold text-accent hover:underline"
      >
        {t("lesson.panel.openInNotebook")}
      </button>
    </div>
  );
}
