"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { sha256Hex } from "@/lib/checksum";
import { createClient } from "@/lib/supabase/client";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

function LessonList({
  subChapterId,
  isAdmin,
  invalidateKeys = [],
}: {
  subChapterId: string;
  isAdmin: boolean;
  invalidateKeys?: unknown[][];
}) {
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ["documents", subChapterId],
    queryFn: () => getBrowserApiClient().listDocuments(subChapterId),
  });

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a PDF file first.");
      if (file.type !== "application/pdf") throw new Error("Only PDF files are supported.");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("File must be under 50MB.");

      const client = getBrowserApiClient();
      const { storage_path, token } = await client.requestDocumentUploadUrl({
        filename: file.name,
        mime_type: "application/pdf",
        size_bytes: file.size,
      });

      const supabase = createClient();
      const { error: uploadStorageError } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(storage_path, token, file, { contentType: "application/pdf" });
      if (uploadStorageError) throw uploadStorageError;

      const checksum = await sha256Hex(file);
      return client.createDocument({
        title,
        storage_path,
        mime_type: "application/pdf",
        size_bytes: file.size,
        checksum,
        sub_chapter_id: subChapterId === "none" ? undefined : subChapterId,
      });
    },
    onSuccess: () => {
      setTitle("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents", subChapterId] });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Failed to upload document.");
    },
  });

  if (documents.isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (documents.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load lessons: {(documents.error as Error).message}
      </p>
    );
  }

  return (
    <div>
      {documents.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lessons yet.</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {documents.data.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/learn/${doc.id}`}
                className="flex items-center justify-between rounded-md border border-border px-md py-sm hover:bg-muted"
              >
                <span className="text-sm font-medium text-foreground">{doc.title}</span>
                <span className="text-xs text-muted-foreground">
                  {doc.status ? (STATUS_LABEL[doc.status] ?? doc.status) : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <form
          className="mt-lg flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
          onSubmit={(event) => {
            event.preventDefault();
            setUploadError(null);
            uploadMutation.mutate();
          }}
        >
          <h3 className="text-sm font-semibold text-foreground">Upload a lesson</h3>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            PDF file
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          {uploadError && (
            <p role="alert" className="text-sm text-danger">
              {uploadError}
            </p>
          )}
          <button
            type="submit"
            disabled={uploadMutation.isPending}
            className="self-start rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload"}
          </button>
        </form>
      )}
    </div>
  );
}

function SubChapterRow({
  subChapter,
  chapterId,
  isAdmin,
  isExpanded,
  onToggle,
}: {
  subChapter: { id: string; title: string; lesson_count: number };
  chapterId: string;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-md border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between px-md py-sm text-left hover:bg-muted"
      >
        <span className="text-sm font-medium text-foreground">{subChapter.title}</span>
        <span className="text-xs text-muted-foreground">
          {subChapter.lesson_count} {subChapter.lesson_count === 1 ? "lesson" : "lessons"}{" "}
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>
      {isExpanded && (
        <div className="border-t border-border px-md py-md">
          <LessonList
            subChapterId={subChapter.id}
            isAdmin={isAdmin}
            invalidateKeys={[["sub-chapters", chapterId]]}
          />
        </div>
      )}
    </li>
  );
}

export default function ChapterLessonsPage() {
  const params = useParams<{ chapterId: string }>();
  const isUncategorized = params.chapterId === "uncategorized";
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters"],
    queryFn: () => getBrowserApiClient().listChapters(),
    enabled: !isUncategorized,
  });
  const subChapters = useQuery({
    queryKey: ["sub-chapters", params.chapterId],
    queryFn: () => getBrowserApiClient().listSubChapters(params.chapterId),
    enabled: !isUncategorized,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubChapterTitle, setNewSubChapterTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createSubChapterMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().createSubChapter(params.chapterId, { title: newSubChapterTitle }),
    onSuccess: () => {
      setNewSubChapterTitle("");
      queryClient.invalidateQueries({ queryKey: ["sub-chapters", params.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["chapters"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create sub-chapter.");
    },
  });

  if (isUncategorized) {
    if (me.isPending) {
      return (
        <main className="p-xl">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </main>
      );
    }
    return (
      <main className="p-xl">
        <Link href="/learn/lessons" className="text-sm text-muted-foreground hover:underline">
          ← All chapters
        </Link>
        <h1 className="mt-xs text-2xl font-semibold text-foreground">Uncategorized</h1>
        <div className="mt-lg">
          <LessonList subChapterId="none" isAdmin={me.data?.role === "admin"} />
        </div>
      </main>
    );
  }

  if (me.isPending || chapters.isPending || subChapters.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (subChapters.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load sub-chapters: {(subChapters.error as Error).message}
        </p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const chapterTitle = chapters.data?.find((chapter) => chapter.id === params.chapterId)?.title;

  return (
    <main className="p-xl">
      <Link href="/learn/lessons" className="text-sm text-muted-foreground hover:underline">
        ← All chapters
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">{chapterTitle ?? "Chapter"}</h1>

      {subChapters.data.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No sub-chapters yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {subChapters.data.map((subChapter) => (
            <SubChapterRow
              key={subChapter.id}
              subChapter={subChapter}
              chapterId={params.chapterId}
              isAdmin={isAdmin}
              isExpanded={expandedId === subChapter.id}
              onToggle={() =>
                setExpandedId((current) => (current === subChapter.id ? null : subChapter.id))
              }
            />
          ))}
        </ul>
      )}

      {isAdmin && (
        <form
          className="mt-2xl flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
          onSubmit={(event) => {
            event.preventDefault();
            setCreateError(null);
            createSubChapterMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-foreground">New sub-chapter</h2>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            Title
            <input
              type="text"
              value={newSubChapterTitle}
              onChange={(event) => setNewSubChapterTitle(event.target.value)}
              required
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
            />
          </label>
          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}
          <button
            type="submit"
            disabled={createSubChapterMutation.isPending}
            className="self-start rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createSubChapterMutation.isPending ? "Creating..." : "Create sub-chapter"}
          </button>
        </form>
      )}
    </main>
  );
}
