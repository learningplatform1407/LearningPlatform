"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";

import type { Annotation, AnnotationCreateRequest } from "@lp/contracts";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { createClient } from "@/lib/supabase/client";
import { findBlockElement, getOffsetsWithinContainer, spliceAnnotations } from "@/lib/text-offset";

function ExtractedImage({ path }: { path: string }) {
  const { data: url, isPending, isError } = useQuery({
    queryKey: ["document-image", path],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (isPending) {
    return <div className="rounded-md border border-border p-md text-sm text-muted-foreground">Loading image...</div>;
  }
  if (isError || !url) {
    return (
      <div role="alert" className="rounded-md border border-border p-md text-sm text-danger">
        Failed to load image.
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not worth next/image config for lecture figures
  return <img src={url} alt="" className="max-w-full rounded-md border border-border" />;
}

function NoteMarker({
  note,
  onDeleteAnnotation,
}: {
  note: Annotation;
  onDeleteAnnotation: (annotationId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative ml-xs inline-block align-top">
      <button
        type="button"
        className="rounded-full border border-border bg-muted px-xs text-xs text-muted-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        note
      </button>
      {open && (
        <span className="absolute left-0 top-full z-10 mt-xs w-56 rounded-md border border-border bg-background p-sm text-sm text-foreground shadow-md">
          <span className="block whitespace-pre-wrap">{note.note_text}</span>
          <button
            type="button"
            className="mt-xs text-xs text-danger"
            onClick={() => {
              onDeleteAnnotation(note.id);
              setOpen(false);
            }}
          >
            Delete note
          </button>
        </span>
      )}
    </span>
  );
}

function AnnotatedParagraph({
  text,
  blockIndex,
  annotations,
  onDeleteAnnotation,
}: {
  text: string;
  blockIndex: number;
  annotations: Annotation[];
  onDeleteAnnotation: (annotationId: string) => void;
}) {
  const blockAnnotations = annotations.filter((a) => a.block_index === blockIndex);
  const segments = spliceAnnotations(text, blockAnnotations);
  const blockNotes = blockAnnotations.filter(
    (a) => a.type === "margin_note" && a.start_offset === null,
  );

  return (
    <p data-block-index={blockIndex} className="text-base leading-relaxed text-foreground">
      {segments.map((segment, index) => {
        if (segment.annotation?.type === "highlight") {
          return (
            <mark
              key={index}
              title="Click to remove highlight"
              className="cursor-pointer rounded-sm bg-yellow-200 px-0.5"
              onClick={() => onDeleteAnnotation(segment.annotation!.id)}
            >
              {segment.text}
            </mark>
          );
        }
        if (segment.annotation?.type === "margin_note") {
          return (
            <span key={index}>
              {segment.text}
              <NoteMarker note={segment.annotation} onDeleteAnnotation={onDeleteAnnotation} />
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
      {blockNotes.map((note) => (
        <NoteMarker key={note.id} note={note} onDeleteAnnotation={onDeleteAnnotation} />
      ))}
    </p>
  );
}

interface PendingSelection {
  blockIndex: number;
  start: number;
  end: number;
  top: number;
  left: number;
}

const TABS = [
  { key: "lesson", label: "Lesson" },
  { key: "quizzes", label: "Quizzes" },
  { key: "flashcards", label: "Flashcards" },
  { key: "notes", label: "Notes" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function QuizzesTab({ documentId }: { documentId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["quizzes", documentId],
    queryFn: () => getBrowserApiClient().listQuizzes(documentId),
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">Coming soon.</p>;
  }
  return (
    <ul className="flex flex-col gap-xs">
      {data.map((quiz) => (
        <li
          key={quiz.id}
          className="rounded-md border border-border px-md py-sm text-sm text-foreground"
        >
          {quiz.title}
        </li>
      ))}
    </ul>
  );
}

function FlashcardsTab({ documentId }: { documentId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["flashcards", documentId],
    queryFn: () => getBrowserApiClient().listFlashcards(documentId),
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">Coming soon.</p>;
  }
  return (
    <ul className="flex flex-col gap-xs">
      {data.map((flashcard) => (
        <li
          key={flashcard.id}
          className="rounded-md border border-border px-md py-sm text-sm text-foreground"
        >
          {flashcard.front_text}
        </li>
      ))}
    </ul>
  );
}

function NotesTab({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const { data: note, isPending } = useQuery({
    queryKey: ["note", documentId],
    queryFn: () => getBrowserApiClient().getNote(documentId),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const value = draft ?? note?.content ?? "";

  const saveMutation = useMutation({
    mutationFn: (content: string) => getBrowserApiClient().upsertNote(documentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note", documentId] });
      setSaved(true);
    },
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-sm">
      <textarea
        value={value}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaved(false);
        }}
        rows={10}
        placeholder="Write your notes for this lesson..."
        className="w-full rounded-md border border-border p-sm text-sm text-foreground focus:border-primary focus:outline-none"
      />
      <div className="flex items-center gap-sm">
        <button
          type="button"
          onClick={() => saveMutation.mutate(value)}
          disabled={saveMutation.isPending}
          className="self-start rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}

export default function LecturePage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const articleRef = useRef<HTMLElement>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("lesson");

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["documents", params.id],
    queryFn: () => getBrowserApiClient().getDocument(params.id),
  });

  const version = data?.current_version;

  const { data: annotations = [] } = useQuery({
    queryKey: ["annotations", params.id],
    queryFn: () => getBrowserApiClient().listAnnotations(params.id),
    enabled: version?.status === "ready",
  });

  const createAnnotationMutation = useMutation({
    mutationFn: (body: AnnotationCreateRequest) => getBrowserApiClient().createAnnotation(params.id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations", params.id] }),
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: (annotationId: string) => getBrowserApiClient().deleteAnnotation(params.id, annotationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations", params.id] }),
  });

  function clearSelectionState() {
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
    setNoteDraft(null);
  }

  function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setPendingSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const blockEl = findBlockElement(range.startContainer);
    if (!blockEl || !articleRef.current?.contains(blockEl)) {
      setPendingSelection(null);
      return;
    }

    const offsets = getOffsetsWithinContainer(blockEl, range);
    if (!offsets || offsets.start === offsets.end) {
      setPendingSelection(null);
      return;
    }

    // jsdom's Range doesn't implement getBoundingClientRect (no layout engine) — guard so
    // selection-driven tests can run without a real browser.
    const rect = range.getBoundingClientRect?.() ?? { top: 0, left: 0 };
    setPendingSelection({
      blockIndex: Number(blockEl.getAttribute("data-block-index")),
      start: offsets.start,
      end: offsets.end,
      top: rect.top,
      left: rect.left,
    });
    setNoteDraft(null);
  }

  function handleHighlight() {
    if (!pendingSelection) return;
    createAnnotationMutation.mutate({
      type: "highlight",
      block_index: pendingSelection.blockIndex,
      start_offset: pendingSelection.start,
      end_offset: pendingSelection.end,
    });
    clearSelectionState();
  }

  function handleSaveNote() {
    if (!pendingSelection || !noteDraft?.trim()) return;
    createAnnotationMutation.mutate({
      type: "margin_note",
      block_index: pendingSelection.blockIndex,
      start_offset: pendingSelection.start,
      end_offset: pendingSelection.end,
      note_text: noteDraft.trim(),
    });
    clearSelectionState();
  }

  if (isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load lecture: {(error as Error).message}
        </p>
      </main>
    );
  }

  return (
    <main className="w-full p-xl">
      <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
        ← Learn
      </Link>
      {data.sub_chapter && (
        <p className="mt-xs text-xs text-muted-foreground">
          <Link href={`/learn/lessons/${data.sub_chapter.chapter.id}`} className="hover:underline">
            {data.sub_chapter.chapter.title}
          </Link>
          {" / "}
          {data.sub_chapter.title}
        </p>
      )}
      <h1 className="mt-xs text-2xl font-semibold text-foreground">{data.title}</h1>

      <div className="mt-lg flex w-full gap-xs border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-md py-sm text-sm font-medium ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-lg">
        {activeTab === "quizzes" && <QuizzesTab documentId={params.id} />}
        {activeTab === "flashcards" && <FlashcardsTab documentId={params.id} />}
        {activeTab === "notes" && <NotesTab documentId={params.id} />}

        {activeTab === "lesson" && (
          <>
            {!version && <p className="text-sm text-muted-foreground">Not processed yet.</p>}
            {version?.status === "processing" && (
              <p className="text-sm text-muted-foreground">Processing...</p>
            )}
            {version?.status === "failed" && (
              <p role="alert" className="text-sm text-danger">
                Processing failed: {version.error_message ?? "Unknown error"}
              </p>
            )}
            {version?.status === "ready" && version.extracted_content && (
              <article
                ref={articleRef}
                onMouseUp={handleMouseUp}
                className="flex flex-col gap-md"
              >
                {version.extracted_content.blocks.map((block, index) => {
                  if (block.type === "heading") {
                    return (
                      <h2 key={index} className="text-xl font-semibold text-foreground">
                        {block.text}
                      </h2>
                    );
                  }
                  if (block.type === "image") {
                    return block.image_path ? (
                      <ExtractedImage key={index} path={block.image_path} />
                    ) : null;
                  }
                  return (
                    <AnnotatedParagraph
                      key={index}
                      text={block.text ?? ""}
                      blockIndex={index}
                      annotations={annotations}
                      onDeleteAnnotation={(annotationId) =>
                        deleteAnnotationMutation.mutate(annotationId)
                      }
                    />
                  );
                })}
              </article>
            )}
          </>
        )}
      </div>

      {activeTab === "lesson" && pendingSelection && (
        <div
          role="toolbar"
          aria-label="Annotation actions"
          className="fixed z-20 flex items-center gap-xs rounded-md border border-border bg-background p-xs shadow-md"
          style={{ top: pendingSelection.top - 44, left: pendingSelection.left }}
        >
          {noteDraft === null ? (
            <>
              <button
                type="button"
                className="rounded-sm px-sm py-xs text-sm text-foreground hover:bg-muted"
                onClick={handleHighlight}
              >
                Highlight
              </button>
              <button
                type="button"
                className="rounded-sm px-sm py-xs text-sm text-foreground hover:bg-muted"
                onClick={() => setNoteDraft("")}
              >
                Add note
              </button>
            </>
          ) : (
            <form
              className="flex items-center gap-xs"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveNote();
              }}
            >
              <input
                autoFocus
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Note..."
                className="rounded-sm border border-border px-sm py-xs text-sm"
              />
              <button type="submit" className="rounded-sm px-sm py-xs text-sm text-foreground hover:bg-muted">
                Save
              </button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
