"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { Annotation, ExtractedContent, NotebookEntry } from "@lp/contracts";

import { Dot } from "@/components/dot";
import { PlusIcon, SparkleIcon, TrashIcon } from "@/components/icons";
import { NotchTabs } from "@/components/notch-tabs";
import { getBrowserApiClient } from "@/lib/api-client.browser";

import { DrawingEntryEditor, useNotebookEntries } from "../notebook/notebook-entries";

export type SidePanelTab = "notebook" | "chat";

const PANEL_TABS = [
  { key: "notebook", label: "Notebook" },
  { key: "chat", label: "Chat AI" },
] as const;

const WIDTH_KEY = "lp-side-panel-width";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 300;

function readWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

/**
 * The right edge (design.md §7): an ink "edge button" that opens a panel
 * sliding over the page, with Notebook and Chat AI tabs. The panel is
 * resizable from its left edge, 300px to 70% of the window.
 */
export function SidePanel({
  open,
  onOpenChange,
  tab,
  onTabChange,
  documentId,
  lessonTitle,
  blocks,
  annotations,
  focusNoteId,
  onJumpToNote,
  onDeleteNote,
  onSaveNoteText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  documentId: string;
  lessonTitle: string;
  blocks: ExtractedContent["blocks"];
  annotations: Annotation[];
  /** The note to show -- set after the note tool or a note bubble. */
  focusNoteId: string | null;
  onJumpToNote: (annotation: Annotation) => void;
  onDeleteNote: (annotation: Annotation) => void;
  onSaveNoteText: (annotation: Annotation, text: string) => void;
}) {
  // Only rendered into the page once the panel opens -- always after
  // hydration -- so reading storage in the initializer can't mismatch.
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? DEFAULT_WIDTH : readWidth(),
  );
  const [resizing, setResizing] = useState(false);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setResizing(true);
  }

  function resize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizing) return;
    const max = window.innerWidth * 0.7;
    setWidth(Math.round(Math.min(max, Math.max(MIN_WIDTH, window.innerWidth - event.clientX))));
  }

  function endResize() {
    if (!resizing) return;
    setResizing(false);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // Private mode or blocked storage: the width just won't be remembered.
    }
  }

  const panelWidth = `min(${width}px, 100vw)`;

  return (
    <>
      <button
        type="button"
        aria-label="Notebook and AI chat"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        style={{ right: open ? panelWidth : 0 }}
        className={`fixed top-1/2 z-[58] flex w-[42px] -translate-y-1/2 justify-center rounded-l-xl border border-r-0 border-border bg-foreground py-3.5 text-background shadow-edge-right ${
          resizing ? "" : "transition-[right] duration-[250ms] ease-in-out"
        }`}
      >
        <SparkleIcon size={20} />
      </button>

      {open && (
        <aside
          data-no-swipe
          aria-label="Notebook and AI chat"
          style={{ width: panelWidth }}
          className="fixed top-0 right-0 bottom-0 z-[57] flex animate-[drawer-in-right_0.25s_ease] motion-reduce:animate-none flex-col border-l border-border bg-background pt-[env(safe-area-inset-top,0px)]"
        >
          <div
            aria-hidden="true"
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="absolute top-0 bottom-0 -left-[5px] w-[10px] cursor-ew-resize touch-none"
          />
          <div className="flex justify-center px-3.5">
            <NotchTabs
              tabs={PANEL_TABS}
              active={tab}
              onChange={onTabChange}
              label="Panel"
              variant="panel"
            />
          </div>
          {tab === "notebook" ? (
            <NotebookPane
              documentId={documentId}
              lessonTitle={lessonTitle}
              blocks={blocks}
              annotations={annotations}
              focusNoteId={focusNoteId}
              onJumpToNote={onJumpToNote}
              onDeleteNote={onDeleteNote}
              onSaveNoteText={onSaveNoteText}
            />
          ) : (
            <ChatPane />
          )}
        </aside>
      )}
    </>
  );
}

type NoteItem =
  | { key: string; kind: "anchored"; createdAt: string; annotation: Annotation }
  | { key: string; kind: "entry"; createdAt: string; entry: NotebookEntry }
  | { key: "draft"; kind: "draft"; createdAt: string };

function quoteOf(blocks: ExtractedContent["blocks"], annotation: Annotation): string | null {
  const text = blocks[annotation.block_index]?.text;
  if (!text || annotation.start_offset === null || annotation.end_offset === null) return null;
  return text.slice(annotation.start_offset, annotation.end_offset);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Lined paper, drawn with a repeating gradient that scrolls with the text
 * (design.md §7). */
const LINED_PAPER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(transparent calc(1.65em - 1px), var(--border) calc(1.65em - 1px))",
  backgroundSize: "100% 1.65em",
  backgroundAttachment: "local",
};

/**
 * This lesson's notes, one at a time: notes anchored to a passage (made with
 * the note tool) and notebook entries written from this lesson. The full
 * notebook, across lessons, stays on its own page.
 */
function NotebookPane({
  documentId,
  lessonTitle,
  blocks,
  annotations,
  focusNoteId,
  onJumpToNote,
  onDeleteNote,
  onSaveNoteText,
}: {
  documentId: string;
  lessonTitle: string;
  blocks: ExtractedContent["blocks"];
  annotations: Annotation[];
  focusNoteId: string | null;
  onJumpToNote: (annotation: Annotation) => void;
  onDeleteNote: (annotation: Annotation) => void;
  onSaveNoteText: (annotation: Annotation, text: string) => void;
}) {
  const queryClient = useQueryClient();
  const entries = useNotebookEntries();
  const [currentKey, setCurrentKey] = useState<string | null>(focusNoteId);
  const [hasDraft, setHasDraft] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Follow a note the page asks for (note tool, note bubble) -- adjusted
  // during render, not in an effect, so the panel never paints the previous
  // note first.
  const [followed, setFollowed] = useState(focusNoteId);
  if (focusNoteId !== followed) {
    setFollowed(focusNoteId);
    if (focusNoteId) setCurrentKey(focusNoteId);
  }

  const items: NoteItem[] = [
    ...annotations
      .filter((a) => a.type === "margin_note")
      .map((annotation) => ({
        key: annotation.id,
        kind: "anchored" as const,
        createdAt: annotation.created_at,
        annotation,
      })),
    ...(entries.data ?? [])
      .filter((entry) => entry.source_document_id === documentId)
      .map((entry) => ({
        key: entry.id,
        kind: "entry" as const,
        createdAt: entry.created_at,
        entry,
      })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (hasDraft) items.push({ key: "draft", kind: "draft", createdAt: "" });

  const index = Math.max(
    0,
    items.findIndex((item) => item.key === currentKey),
  );
  const current = items.length > 0 ? items[Math.min(index, items.length - 1)] : undefined;

  const updateEntry = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      getBrowserApiClient().updateNotebookEntry(id, { content }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notebook-entries"] }),
  });
  const createEntry = useMutation({
    mutationFn: (content: string) =>
      getBrowserApiClient().createNotebookEntry({
        type: "text",
        content,
        source_document_id: documentId,
      }),
    onSuccess: (created) => {
      setHasDraft(false);
      setCurrentKey(created.id);
      void queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
    },
  });
  const deleteEntry = useMutation({
    mutationFn: (id: string) => getBrowserApiClient().deleteNotebookEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notebook-entries"] }),
  });

  function go(step: -1 | 1) {
    const next = items[index + step];
    if (next) setCurrentKey(next.key);
  }

  function newNote() {
    setHasDraft(true);
    setCurrentKey("draft");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function remove() {
    if (!current) return;
    if (current.kind === "anchored") onDeleteNote(current.annotation);
    if (current.kind === "entry") deleteEntry.mutate(current.entry.id);
    if (current.kind === "draft") setHasDraft(false);
    setCurrentKey(items[index - 1]?.key ?? items[index + 1]?.key ?? null);
  }

  // Saved when the text area loses focus -- which every way out of a note
  // (‹ ›, +, the trash, closing the panel) passes through. An empty new note
  // simply never gets created.
  function save(text: string) {
    if (!current) return;
    if (current.kind === "anchored") {
      if (text !== (current.annotation.note_text ?? "")) onSaveNoteText(current.annotation, text);
    } else if (current.kind === "entry") {
      if (text !== (current.entry.content ?? "")) {
        updateEntry.mutate({ id: current.entry.id, content: text });
      }
    } else if (text.trim()) {
      createEntry.mutate(text);
    } else {
      setHasDraft(false);
      setCurrentKey(items[index - 1]?.key ?? null);
    }
  }

  const quote = current?.kind === "anchored" ? quoteOf(blocks, current.annotation) : null;
  const kindLabel =
    current?.kind === "anchored"
      ? "Note on a passage"
      : current?.kind === "entry" && current.entry.type === "drawing"
        ? "Drawing"
        : "Note";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-[18px] pt-4 pb-1.5">
        <NavButton label="Previous note" disabled={index <= 0} onClick={() => go(-1)}>
          ‹
        </NavButton>
        <span className="flex-1 text-center text-sm font-extrabold">
          {items.length === 0 ? "Notebook" : `Note ${index + 1} of ${items.length}`}
        </span>
        <NavButton label="Next note" disabled={index >= items.length - 1} onClick={() => go(1)}>
          ›
        </NavButton>
        <NavButton label="Delete note" disabled={!current} onClick={remove}>
          <TrashIcon size={17} />
        </NavButton>
      </div>

      {!current && (
        <p className="px-[18px] pt-sm text-sm text-muted-foreground">
          No notes for this lesson yet. Drag over a passage with the note tool (W), or start one
          with +.
        </p>
      )}

      {current && (
        <>
          <p className="px-[18px] text-caption font-semibold text-muted-foreground">
            <b className="text-foreground">{lessonTitle}</b> · {kindLabel}
            {current.createdAt && <> · {formatWhen(current.createdAt)}</>}
          </p>
          {current.kind === "anchored" && quote && (
            <button
              type="button"
              onClick={() => onJumpToNote(current.annotation)}
              className="mx-[18px] mt-2.5 rounded-r-sm border-l-[3px] border-accent bg-muted px-3 py-2 text-left text-sm text-foreground italic"
            >
              {quote}
            </button>
          )}
          {current.kind === "entry" && current.entry.type === "drawing" ? (
            <div className="flex-1 overflow-y-auto px-[18px] pt-2.5 pb-[80px]">
              <DrawingEntryEditor key={current.entry.id} entry={current.entry} />
            </div>
          ) : (
            <textarea
              key={current.key}
              ref={textareaRef}
              aria-label="Note"
              placeholder="Write your note here..."
              defaultValue={
                current.kind === "anchored"
                  ? (current.annotation.note_text ?? "")
                  : current.kind === "entry"
                    ? (current.entry.content ?? "")
                    : ""
              }
              autoFocus={current.kind !== "entry" && current.key === focusNoteId}
              onBlur={(event) => save(event.target.value)}
              style={LINED_PAPER}
              className="mx-[18px] mt-2.5 mb-[80px] flex-1 resize-none border-0 bg-transparent py-1 text-base leading-[1.65] text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
            />
          )}
        </>
      )}

      <Dot
        aria-label="New note"
        title="New note"
        onClick={newNote}
        className="absolute bottom-[18px] left-[18px]"
      >
        <PlusIcon size={22} />
      </Dot>
      <Link
        href="/learn/notebook"
        className="absolute right-[18px] bottom-[26px] text-sm font-bold text-accent hover:underline"
      >
        All notes →
      </Link>
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-sm p-0 text-xl leading-none hover:bg-muted disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** No AI backend exists yet; the pane is the real design with an honest
 * empty state, so the panel's shape is settled when it does. */
function ChatPane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-[18px] text-ui">
        <div className="max-w-[92%] rounded-[14px] bg-muted px-[13px] py-2.5">
          Ask questions about this lesson and get answers drawn from it.
          <span className="mt-1.5 block text-caption text-muted-foreground">
            AI chat is coming soon.
          </span>
        </div>
      </div>
      <form
        onSubmit={(event) => event.preventDefault()}
        className="flex gap-2 border-t border-border px-[18px] pt-3 pb-[18px]"
      >
        <input
          disabled
          aria-label="Ask about this lesson"
          placeholder="Ask something about this lesson..."
          className="field"
        />
        <button
          type="submit"
          disabled
          className="rounded-md bg-foreground px-3.5 font-bold text-background disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
