"use client";

import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";

import {
  DrawingEntryEditor,
  NewEntryButtons,
  NotebookEntryList,
  TextEntryEditor,
  useNotebookEntries,
} from "./notebook-entries";

type Selection =
  { kind: "entry"; entryId: string } | { kind: "new-text" } | { kind: "new-drawing" };

export default function NotebookPage() {
  const { t } = useI18n();
  const [selection, setSelection] = useState<Selection | null>(null);
  const entries = useNotebookEntries();

  if (entries.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </main>
    );
  }

  if (entries.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          {t("notebook.loadFailed")}
        </p>
      </main>
    );
  }

  const notebookEntries = entries.data;
  const selectedEntry =
    selection?.kind === "entry"
      ? notebookEntries.find((e) => e.id === selection.entryId)
      : undefined;

  return (
    <main className="flex w-full">
      <nav
        aria-label={t("notebook.contents")}
        className={`sticky top-0 h-screen w-full shrink-0 flex-col border-border md:flex md:w-64 md:border-r ${
          selection ? "hidden" : "flex"
        }`}
      >
        <div className="flex flex-1 flex-col gap-md overflow-y-auto px-sm pt-[42px] pb-md">
          {/* The title lives with the editor on wide screens; on a phone the
              list is the whole page, so it carries the title instead. */}
          <div className="-mt-[42px] px-1.5 md:hidden">
            <PageHeader kicker={t("nav.learn")} title={t("notebook.title")} />
          </div>
          <h2 className="label-caps ml-1.5">{t("notebook.notes")}</h2>
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

      <div
        className={`mx-auto h-screen w-full max-w-[47.5rem] min-w-0 flex-1 flex-col px-md pb-lg md:flex md:px-xl ${
          selection ? "flex" : "hidden"
        }`}
      >
        <div className="shrink-0">
          {/* Below md the list and the editor take turns on screen. */}
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="mt-md text-toc font-bold text-accent md:hidden"
          >
            {t("notebook.allNotes")}
          </button>
          <PageHeader kicker={t("nav.learn")} title={t("notebook.title")} />
        </div>

        <div className="mt-lg flex min-h-0 flex-1 flex-col">
          {!selection && (
            <p className="text-toc text-muted-foreground">{t("notebook.selectPrompt")}</p>
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
