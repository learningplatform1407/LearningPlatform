"use client";

import Link from "next/link";
import { useState } from "react";

import {
  DrawingEntryEditor,
  NewEntryButtons,
  NotebookEntryList,
  TextEntryEditor,
  useNotebookEntries,
} from "./notebook-entries";

type Selection =
  | { kind: "entry"; entryId: string }
  | { kind: "new-text" }
  | { kind: "new-drawing" };

export default function NotebookPage() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const entries = useNotebookEntries();

  if (entries.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (entries.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load your notebook.
        </p>
      </main>
    );
  }

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
          <NotebookEntryList
            entries={notebookEntries}
            selectedEntryId={selection?.kind === "entry" ? selection.entryId : undefined}
            onSelect={(entryId) => setSelection({ kind: "entry", entryId })}
          />
        </div>

        <NewEntryButtons
          onNewText={() => setSelection({ kind: "new-text" })}
          onNewDrawing={() => setSelection({ kind: "new-drawing" })}
        />
      </nav>

      <div className="flex h-screen min-w-0 flex-1 flex-col p-xl">
        <h1 className="shrink-0 text-2xl font-semibold text-foreground">Notebook</h1>

        <div className="mt-lg flex min-h-0 flex-1 flex-col">
          {!selection && (
            <p className="text-sm text-muted-foreground">
              Select a note on the left, or create a new one.
            </p>
          )}
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
