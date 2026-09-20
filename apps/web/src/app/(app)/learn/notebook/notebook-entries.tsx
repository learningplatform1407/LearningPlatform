"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { NotebookEntry } from "@lp/contracts";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";

import { DrawingCanvas, DrawingThumbnail } from "./drawing-canvas";

// Shared between the main Notebook page and the lesson reader's Notes panel
// — notes live in one common pool (`notebook_entries`), not linked to any
// lesson, so both surfaces browse/edit the exact same data with the exact
// same components.

export function firstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.trim() || "Untitled note";
}

export function useNotebookEntries() {
  return useQuery({
    queryKey: ["notebook-entries"],
    queryFn: () => getBrowserApiClient().listNotebookEntries(),
  });
}

export function NotebookEntryList({
  entries,
  selectedEntryId,
  onSelect,
}: {
  entries: NotebookEntry[];
  selectedEntryId?: string;
  onSelect: (entryId: string) => void;
}) {
  return (
    <div>
      {entries.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
      <ul className="flex flex-col gap-xs">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              className={`block w-full rounded-md border-l-2 px-sm py-xs text-left text-sm ${
                selectedEntryId === entry.id
                  ? "border-primary bg-primary/5 font-semibold text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {entry.type === "text" ? (
                <span className="block truncate">{firstLine(entry.content ?? "")}</span>
              ) : (
                <span className="flex flex-col gap-xs">
                  <span>Drawing</span>
                  <DrawingThumbnail strokes={entry.strokes ?? []} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewEntryButtons({
  onNewText,
  onNewDrawing,
}: {
  onNewText: () => void;
  onNewDrawing: () => void;
}) {
  return (
    <div className="flex items-center gap-xs border-t border-border p-sm">
      <button
        type="button"
        onClick={onNewText}
        className="flex-1 rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted"
      >
        + Text
      </button>
      <button
        type="button"
        onClick={onNewDrawing}
        className="flex-1 rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted"
      >
        + Drawing
      </button>
    </div>
  );
}

export function TextEntryEditor({
  entry,
  sourceDocumentId,
  onCreated,
  onDeleted,
}: {
  entry?: NotebookEntry;
  sourceDocumentId?: string;
  onCreated?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(entry?.content ?? "");
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // The note's first line doubles as its title (Apple Notes/Keep-style) —
  // there's no separate title field, so splitting/joining on "\n" is what
  // keeps the title and body editable as two inputs while staying a single
  // `content` string for storage.
  const draftLines = draft.split("\n");
  const titleValue = draftLines[0] ?? "";
  const bodyValue = draftLines.slice(1).join("\n");

  function setTitle(next: string) {
    setDraft([next, ...draftLines.slice(1)].join("\n"));
    setSaved(false);
  }

  function setBody(next: string) {
    setDraft([titleValue, next].join("\n"));
    setSaved(false);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().createNotebookEntry({
        type: "text",
        content: draft,
        source_document_id: sourceDocumentId,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      setSaved(true);
      onCreated?.(created.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => getBrowserApiClient().updateNotebookEntry(entry!.id, { content: draft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      setSaved(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => getBrowserApiClient().deleteNotebookEntry(entry!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      onDeleted?.();
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-sm">
      <div className="flex min-h-[240px] flex-1 flex-col rounded-md border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
        <input
          type="text"
          value={titleValue}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              bodyRef.current?.focus();
            }
          }}
          placeholder="Title"
          className="border-0 bg-transparent px-sm pt-sm text-base font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <textarea
          ref={bodyRef}
          value={bodyValue}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a new note..."
          className="w-full flex-1 resize-none border-0 bg-transparent px-sm pb-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-sm">
        <Button
          onClick={() => (entry ? updateMutation.mutate() : createMutation.mutate())}
          disabled={createMutation.isPending || updateMutation.isPending || !draft.trim()}
          className="self-start"
        >
          {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
        </Button>
        {entry && (
          <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            Delete
          </Button>
        )}
        {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}

export function DrawingEntryEditor({
  entry,
  sourceDocumentId,
  onCreated,
  onDeleted,
}: {
  entry?: NotebookEntry;
  sourceDocumentId?: string;
  onCreated?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [strokes, setStrokes] = useState(entry?.strokes ?? []);
  const [saved, setSaved] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().createNotebookEntry({
        type: "drawing",
        strokes,
        source_document_id: sourceDocumentId,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      setSaved(true);
      onCreated?.(created.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => getBrowserApiClient().updateNotebookEntry(entry!.id, { strokes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      setSaved(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => getBrowserApiClient().deleteNotebookEntry(entry!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      onDeleted?.();
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-sm">
      <DrawingCanvas
        strokes={strokes}
        onChange={(next) => {
          setStrokes(next);
          setSaved(false);
        }}
      />
      <div className="flex items-center gap-sm">
        <Button
          onClick={() => (entry ? updateMutation.mutate() : createMutation.mutate())}
          disabled={createMutation.isPending || updateMutation.isPending || strokes.length === 0}
          className="self-start"
        >
          {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
        </Button>
        {entry && (
          <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            Delete
          </Button>
        )}
        {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}
