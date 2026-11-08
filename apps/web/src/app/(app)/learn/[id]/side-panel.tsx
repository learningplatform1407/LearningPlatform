"use client";

import type { Translator } from "@lp/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { Annotation, ExtractedContent, NotebookEntry } from "@lp/contracts";

import { Dot } from "@/components/dot";
import { PlusIcon, SparkleIcon, TrashIcon } from "@/components/icons";
import { NotchTabs } from "@/components/notch-tabs";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

import { DrawingEntryEditor, firstLine, useNotebookEntries } from "../notebook/notebook-entries";

export type SidePanelTab = "notebook" | "chat";

const PANEL_TABS = [
  { key: "notebook", label: "lesson.panel.notebook" },
  { key: "chat", label: "lesson.panel.chat" },
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
  const { t } = useI18n();
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
        aria-label={t("lesson.panel.label")}
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
          aria-label={t("lesson.panel.label")}
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
              tabs={PANEL_TABS.map((entry) => ({ ...entry, label: t(entry.label) }))}
              active={tab}
              onChange={onTabChange}
              label={t("lesson.panel.tabs")}
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

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, {
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
 * the note tool) and notebook entries written from this lesson. t("lesson.panel.allNotes")
 * lists the whole notebook inside the panel, so any note -- this lesson's or
 * another's -- opens here without leaving the lesson.
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
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const entries = useNotebookEntries();
  const [currentKey, setCurrentKey] = useState<string | null>(focusNoteId);
  const [hasDraft, setHasDraft] = useState(false);
  // The t("lesson.panel.allNotes") list, and a note from elsewhere in the notebook opened
  // from it (it isn't one of this lesson's, so ‹ › don't step through it).
  const [listing, setListing] = useState(false);
  const [outsideId, setOutsideId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Follow a note the page asks for (note tool, note bubble) -- adjusted
  // during render, not in an effect, so the panel never paints the previous
  // note first.
  const [followed, setFollowed] = useState(focusNoteId);
  if (focusNoteId !== followed) {
    setFollowed(focusNoteId);
    if (focusNoteId) {
      setCurrentKey(focusNoteId);
      setListing(false);
      setOutsideId(null);
    }
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
  const outside = outsideId ? entries.data?.find((entry) => entry.id === outsideId) : undefined;
  const current: NoteItem | undefined = outside
    ? { key: outside.id, kind: "entry", createdAt: outside.created_at, entry: outside }
    : items.length > 0
      ? items[Math.min(index, items.length - 1)]
      : undefined;
  const otherEntries = (entries.data ?? []).filter(
    (entry) => entry.source_document_id !== documentId,
  );

  function openFromList(key: string, inThisLesson: boolean) {
    setListing(false);
    if (inThisLesson) {
      setOutsideId(null);
      setCurrentKey(key);
    } else {
      setOutsideId(key);
    }
  }

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

  function backToLesson() {
    setOutsideId(null);
  }

  function newNote() {
    setListing(false);
    setOutsideId(null);
    setHasDraft(true);
    setCurrentKey("draft");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function remove() {
    if (!current) return;
    if (current.kind === "anchored") onDeleteNote(current.annotation);
    if (current.kind === "entry") deleteEntry.mutate(current.entry.id);
    if (current.kind === "draft") setHasDraft(false);
    if (outside) {
      setOutsideId(null);
      return;
    }
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
      ? t("lesson.panel.noteOnPassage")
      : current?.kind === "entry" && current.entry.type === "drawing"
        ? t("lesson.panel.drawing")
        : t("lesson.panel.note");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-[18px] pt-4 pb-1.5">
        {listing ? (
          <span className="flex-1 text-center text-sm font-extrabold">
            {t("lesson.panel.allNotes")}
          </span>
        ) : outside ? (
          <>
            <button
              type="button"
              onClick={backToLesson}
              className="text-sm font-bold text-accent hover:underline"
            >
              {t("lesson.panel.backToLesson")}
            </button>
            <span className="flex-1 text-center text-sm font-extrabold">
              {t("lesson.panel.fromNotebook")}
            </span>
          </>
        ) : (
          <>
            <NavButton
              label={t("lesson.panel.previousNote")}
              disabled={index <= 0}
              onClick={() => go(-1)}
            >
              ‹
            </NavButton>
            <span className="flex-1 text-center text-sm font-extrabold">
              {items.length === 0
                ? t("lesson.panel.notebook")
                : t("lesson.panel.noteOf", { index: index + 1, total: items.length })}
            </span>
            <NavButton
              label={t("lesson.panel.nextNote")}
              disabled={index >= items.length - 1}
              onClick={() => go(1)}
            >
              ›
            </NavButton>
          </>
        )}
        {!listing && (
          <NavButton label={t("lesson.panel.deleteNote")} disabled={!current} onClick={remove}>
            <TrashIcon size={17} />
          </NavButton>
        )}
      </div>

      {listing && (
        <nav
          aria-label={t("lesson.panel.allNotes")}
          className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-[80px]"
        >
          <NoteList
            heading={t("lesson.panel.thisLesson")}
            rows={items
              .filter((item) => item.kind !== "draft")
              .map((item) => ({
                key: item.key,
                title: noteTitle(t, item, blocks),
                current: !outside && item.key === current?.key,
                onOpen: () => openFromList(item.key, true),
              }))}
            empty={t("lesson.panel.noLessonNotes")}
          />
          <NoteList
            heading={t("lesson.panel.otherNotes")}
            rows={otherEntries.map((entry) => ({
              key: entry.id,
              title:
                entry.type === "drawing"
                  ? t("lesson.panel.drawing")
                  : firstLine(entry.content ?? "") || t("lesson.panel.untitled"),
              current: entry.id === outsideId,
              onOpen: () => openFromList(entry.id, false),
            }))}
            empty={t("lesson.panel.nothingElse")}
          />
          <Link
            href="/learn/notebook"
            className="mt-md inline-block text-sm font-bold text-accent hover:underline"
          >
            {t("lesson.panel.openNotebook")}
          </Link>
        </nav>
      )}

      {!listing && !current && (
        <p className="px-[18px] pt-sm text-sm text-muted-foreground">
          {t("lesson.panel.emptyHint")}
        </p>
      )}

      {!listing && current && (
        <>
          <p className="px-[18px] text-caption font-semibold text-muted-foreground">
            <b className="text-foreground">{outside ? t("lesson.panel.notebook") : lessonTitle}</b>{" "}
            · {kindLabel}
            {current.createdAt && <> · {formatWhen(current.createdAt, locale)}</>}
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
              aria-label={t("lesson.panel.note")}
              placeholder={t("lesson.panel.placeholder")}
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
        aria-label={t("lesson.panel.newNote")}
        title={t("lesson.panel.newNote")}
        onClick={newNote}
        className="absolute bottom-[18px] left-[18px]"
      >
        <PlusIcon size={22} />
      </Dot>
      <button
        type="button"
        aria-pressed={listing}
        onClick={() => setListing((open) => !open)}
        className="absolute right-[18px] bottom-[26px] text-sm font-bold text-accent hover:underline"
      >
        {listing ? t("lesson.panel.backToNote") : t("lesson.panel.allNotes")}
      </button>
    </div>
  );
}

/** What a note is called in the list: its passage, its first line, or
 * "Drawing". */
function noteTitle(t: Translator["t"], item: NoteItem, blocks: ExtractedContent["blocks"]): string {
  if (item.kind === "anchored") {
    return (
      item.annotation.note_text?.trim() ||
      quoteOf(blocks, item.annotation) ||
      t("lesson.panel.noteOnPassage")
    );
  }
  if (item.kind === "entry") {
    return item.entry.type === "drawing"
      ? t("lesson.panel.drawing")
      : firstLine(item.entry.content ?? "") || t("lesson.panel.untitled");
  }
  return t("lesson.panel.newNote");
}

function NoteList({
  heading,
  rows,
  empty,
}: {
  heading: string;
  rows: { key: string; title: string; current: boolean; onOpen: () => void }[];
  empty: string;
}) {
  return (
    <section className="mt-sm">
      <h3 className="label-caps mb-1.5">{heading}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={row.onOpen}
                aria-current={row.current || undefined}
                className="block w-full truncate rounded-sm px-2 py-1.5 text-left text-toc font-semibold text-foreground hover:bg-muted aria-current:bg-muted aria-current:font-extrabold"
              >
                {row.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  const { t } = useI18n();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-[18px] text-ui">
        <div className="max-w-[92%] rounded-[14px] bg-muted px-[13px] py-2.5">
          {t("lesson.panel.chatIntro")}
          <span className="mt-1.5 block text-caption text-muted-foreground">
            {t("lesson.panel.chatSoon")}
          </span>
        </div>
      </div>
      <form
        onSubmit={(event) => event.preventDefault()}
        className="flex gap-2 border-t border-border px-[18px] pt-3 pb-[18px]"
      >
        <input
          disabled
          aria-label={t("lesson.panel.askLabel")}
          placeholder={t("lesson.panel.askPlaceholder")}
          className="field"
        />
        <button
          type="submit"
          disabled
          className="rounded-md bg-foreground px-3.5 font-bold text-background disabled:opacity-50"
        >
          {t("lesson.panel.send")}
        </button>
      </form>
    </div>
  );
}
