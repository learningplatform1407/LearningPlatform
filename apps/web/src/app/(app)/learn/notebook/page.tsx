"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import type { NotebookEntry } from "@lp/contracts";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";

import { NotesTab } from "../[id]/page";
import { DrawingCanvas, DrawingThumbnail } from "./drawing-canvas";

type Selection =
  | { kind: "lesson"; documentId: string }
  | { kind: "entry"; entryId: string }
  | { kind: "new-text" }
  | { kind: "new-drawing" };

function firstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.trim() || "Untitled note";
}

function TextEntryEditor({
  entry,
  onCreated,
  onDeleted,
}: {
  entry?: NotebookEntry;
  onCreated?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(entry?.content ?? "");
  const [saved, setSaved] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => getBrowserApiClient().createNotebookEntry({ type: "text", content: draft }),
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
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaved(false);
        }}
        placeholder="Write a new note..."
        className="min-h-[240px] w-full flex-1 resize-none rounded-md border border-border p-sm text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
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

function DrawingEntryEditor({
  entry,
  onCreated,
  onDeleted,
}: {
  entry?: NotebookEntry;
  onCreated?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [strokes, setStrokes] = useState(entry?.strokes ?? []);
  const [saved, setSaved] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => getBrowserApiClient().createNotebookEntry({ type: "drawing", strokes }),
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

export default function NotebookPage() {
  const [selection, setSelection] = useState<Selection | null>(null);

  const myNotes = useQuery({
    queryKey: ["my-notes"],
    queryFn: () => getBrowserApiClient().listMyNotes(),
  });
  const entries = useQuery({
    queryKey: ["notebook-entries"],
    queryFn: () => getBrowserApiClient().listNotebookEntries(),
  });

  if (myNotes.isPending || entries.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (myNotes.isError || entries.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load your notebook.
        </p>
      </main>
    );
  }

  const lessonNotes = myNotes.data;
  const notebookEntries = entries.data;
  const selectedEntry =
    selection?.kind === "entry" ? notebookEntries.find((e) => e.id === selection.entryId) : undefined;

  return (
    <main className="flex w-full">
      <nav
        aria-label="Notebook contents"
        className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border"
      >
        <div className="flex flex-1 flex-col gap-md overflow-y-auto p-md">
          <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
            ← Learn
          </Link>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lesson notes
            </h2>
            {lessonNotes.length === 0 && (
              <p className="mt-xs text-sm text-muted-foreground">No lesson notes yet.</p>
            )}
            <ul className="mt-xs flex flex-col gap-xs">
              {lessonNotes.map((note) => (
                <li key={note.document_id}>
                  <button
                    type="button"
                    onClick={() => setSelection({ kind: "lesson", documentId: note.document_id })}
                    className={`block w-full rounded-md border-l-2 px-sm py-xs text-left text-sm ${
                      selection?.kind === "lesson" && selection.documentId === note.document_id
                        ? "border-primary bg-primary/5 font-semibold text-primary"
                        : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className="block truncate font-medium text-foreground">
                      {note.document_title}
                    </span>
                    <span className="block truncate text-xs">{firstLine(note.content)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              My notes
            </h2>
            {notebookEntries.length === 0 && (
              <p className="mt-xs text-sm text-muted-foreground">No notes yet.</p>
            )}
            <ul className="mt-xs flex flex-col gap-xs">
              {notebookEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setSelection({ kind: "entry", entryId: entry.id })}
                    className={`block w-full rounded-md border-l-2 px-sm py-xs text-left text-sm ${
                      selection?.kind === "entry" && selection.entryId === entry.id
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
        </div>

        <div className="flex items-center gap-xs border-t border-border p-sm">
          <button
            type="button"
            onClick={() => setSelection({ kind: "new-text" })}
            className="flex-1 rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted"
          >
            + Text
          </button>
          <button
            type="button"
            onClick={() => setSelection({ kind: "new-drawing" })}
            className="flex-1 rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted"
          >
            + Drawing
          </button>
        </div>
      </nav>

      <div className="min-w-0 flex-1 p-xl">
        <h1 className="text-2xl font-semibold text-foreground">Notebook</h1>

        <div className="mt-lg flex min-h-[70vh] flex-col">
          {!selection && (
            <p className="text-sm text-muted-foreground">
              Select a note on the left, or create a new one.
            </p>
          )}
          {selection?.kind === "lesson" && <NotesTab documentId={selection.documentId} />}
          {selection?.kind === "new-text" && (
            <TextEntryEditor onCreated={(id) => setSelection({ kind: "entry", entryId: id })} />
          )}
          {selection?.kind === "new-drawing" && (
            <DrawingEntryEditor onCreated={(id) => setSelection({ kind: "entry", entryId: id })} />
          )}
          {selection?.kind === "entry" && selectedEntry?.type === "text" && (
            <TextEntryEditor
              key={selectedEntry.id}
              entry={selectedEntry}
              onDeleted={() => setSelection(null)}
            />
          )}
          {selection?.kind === "entry" && selectedEntry?.type === "drawing" && (
            <DrawingEntryEditor
              key={selectedEntry.id}
              entry={selectedEntry}
              onDeleted={() => setSelection(null)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
