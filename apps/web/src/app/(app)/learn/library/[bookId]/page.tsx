"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { computeLessonCompletionPercent } from "@lp/api-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button";
import { ProgressBar } from "@/components/progress-bar";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { sha256Hex } from "@/lib/checksum";
import { createClient } from "@/lib/supabase/client";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

function UncategorizedLessonsPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getBrowserApiClient().listDocuments("none"),
  });
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getBrowserApiClient().getQuestionBankTree(),
  });
  const lessonProgress = new Map<string, BankTreeLesson>(
    tree.data?.uncategorized_lessons.map((lesson) => [lesson.id, lesson]),
  );

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
      });
    },
    onSuccess: () => {
      setTitle("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents", "uncategorized"] });
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Failed to upload document.");
    },
  });

  if (me.isPending || uncategorized.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <main className="p-xl">
      <Link href="/learn/library" className="text-sm text-muted-foreground hover:underline">
        ← Library
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Uncategorized</h1>
      <div className="mt-lg">
        {uncategorized.data && uncategorized.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lessons yet.</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {uncategorized.data?.map((doc) => (
              <li
                key={doc.id}
                className="rounded-md border border-border px-md py-sm hover:bg-muted"
              >
                <Link href={`/learn/${doc.id}`} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{doc.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {doc.status ? (STATUS_LABEL[doc.status] ?? doc.status) : ""}
                  </span>
                </Link>
                <ProgressBar
                  percent={computeLessonCompletionPercent(
                    lessonProgress.get(doc.id) ?? {
                      eligible_lesson_count: 0,
                      completed_lesson_count: 0,
                    },
                  )}
                />
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
                className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
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
            <Button type="submit" disabled={uploadMutation.isPending} className="self-start">
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

function LessonList({
  subChapterId,
  isAdmin,
  invalidateKeys = [],
  lessonProgress,
}: {
  subChapterId: string;
  isAdmin: boolean;
  invalidateKeys?: unknown[][];
  lessonProgress: Map<string, BankTreeLesson>;
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
            <li key={doc.id} className="rounded-md border border-border px-md py-sm hover:bg-muted">
              <Link href={`/learn/${doc.id}`} className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{doc.title}</span>
                <span className="text-xs text-muted-foreground">
                  {doc.status ? (STATUS_LABEL[doc.status] ?? doc.status) : ""}
                </span>
              </Link>
              <ProgressBar
                percent={computeLessonCompletionPercent(
                  lessonProgress.get(doc.id) ?? {
                    eligible_lesson_count: 0,
                    completed_lesson_count: 0,
                  },
                )}
              />
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
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          <Button type="submit" disabled={uploadMutation.isPending} className="self-start">
            {uploadMutation.isPending ? "Uploading..." : "Upload"}
          </Button>
        </form>
      )}
    </div>
  );
}

function SubChapterRow({
  subChapter,
  subChapterNode,
  chapterId,
  isAdmin,
  isExpanded,
  onToggle,
}: {
  subChapter: { id: string; title: string; lesson_count: number };
  subChapterNode: BankTreeSubChapter | undefined;
  chapterId: string;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const lessonProgress = new Map<string, BankTreeLesson>(
    subChapterNode?.lessons.map((lesson) => [lesson.id, lesson]),
  );
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
      {subChapterNode && (
        <div className="px-md pb-sm">
          <ProgressBar percent={computeLessonCompletionPercent(subChapterNode)} />
        </div>
      )}
      {isExpanded && (
        <div className="border-t border-border px-md py-md">
          <LessonList
            subChapterId={subChapter.id}
            isAdmin={isAdmin}
            invalidateKeys={[["sub-chapters", chapterId]]}
            lessonProgress={lessonProgress}
          />
        </div>
      )}
    </li>
  );
}

function ChapterRow({
  chapter,
  chapterNode,
  bookId,
  isAdmin,
  isExpanded,
  onToggle,
}: {
  chapter: { id: string; title: string; sub_chapter_count: number };
  chapterNode: BankTreeChapter | undefined;
  bookId: string;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const subChapterProgress = new Map<string, BankTreeSubChapter>(
    chapterNode?.sub_chapters.map((subChapter) => [subChapter.id, subChapter]),
  );
  const queryClient = useQueryClient();
  const subChapters = useQuery({
    queryKey: ["sub-chapters", chapter.id],
    queryFn: () => getBrowserApiClient().listSubChapters(chapter.id),
    enabled: isExpanded,
  });

  const [expandedSubChapterId, setExpandedSubChapterId] = useState<string | null>(null);
  const [newSubChapterTitle, setNewSubChapterTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createSubChapterMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().createSubChapter(chapter.id, { title: newSubChapterTitle }),
    onSuccess: () => {
      setNewSubChapterTitle("");
      queryClient.invalidateQueries({ queryKey: ["sub-chapters", chapter.id] });
      queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create sub-chapter.");
    },
  });

  return (
    <li className="rounded-md border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between px-md py-sm text-left hover:bg-muted"
      >
        <span className="text-sm font-medium text-foreground">{chapter.title}</span>
        <span className="text-xs text-muted-foreground">
          {chapter.sub_chapter_count}{" "}
          {chapter.sub_chapter_count === 1 ? "sub-chapter" : "sub-chapters"}{" "}
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>
      {chapterNode && (
        <div className="px-md pb-sm">
          <ProgressBar percent={computeLessonCompletionPercent(chapterNode)} />
        </div>
      )}
      {isExpanded && (
        <div className="border-t border-border px-md py-md">
          {subChapters.isPending ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : subChapters.isError ? (
            <p role="alert" className="text-sm text-danger">
              Failed to load sub-chapters: {(subChapters.error as Error).message}
            </p>
          ) : subChapters.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sub-chapters yet.</p>
          ) : (
            <ul className="flex flex-col gap-xs">
              {subChapters.data.map((subChapter) => (
                <SubChapterRow
                  key={subChapter.id}
                  subChapter={subChapter}
                  subChapterNode={subChapterProgress.get(subChapter.id)}
                  chapterId={chapter.id}
                  isAdmin={isAdmin}
                  isExpanded={expandedSubChapterId === subChapter.id}
                  onToggle={() =>
                    setExpandedSubChapterId((current) =>
                      current === subChapter.id ? null : subChapter.id,
                    )
                  }
                />
              ))}
            </ul>
          )}

          {isAdmin && (
            <form
              className="mt-lg flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
              onSubmit={(event) => {
                event.preventDefault();
                setCreateError(null);
                createSubChapterMutation.mutate();
              }}
            >
              <h3 className="text-sm font-semibold text-foreground">New sub-chapter</h3>
              <label className="flex flex-col gap-xs text-sm text-foreground">
                Title
                <input
                  type="text"
                  value={newSubChapterTitle}
                  onChange={(event) => setNewSubChapterTitle(event.target.value)}
                  required
                  className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              {createError && (
                <p role="alert" className="text-sm text-danger">
                  {createError}
                </p>
              )}
              <Button
                type="submit"
                disabled={createSubChapterMutation.isPending}
                className="self-start"
              >
                {createSubChapterMutation.isPending ? "Creating..." : "Create sub-chapter"}
              </Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

function BookChaptersPage({ bookId }: { bookId: string }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters", bookId],
    queryFn: () => getBrowserApiClient().listChapters(bookId),
  });
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getBrowserApiClient().getQuestionBankTree(),
  });
  const bookNode = tree.data?.books.find((book) => book.id === bookId);
  const chapterProgress = new Map<string, BankTreeChapter>(
    bookNode?.chapters.map((chapter) => [chapter.id, chapter]),
  );

  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createChapterMutation = useMutation({
    mutationFn: () => getBrowserApiClient().createChapter(bookId, { title }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create chapter.");
    },
  });

  if (me.isPending || chapters.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (chapters.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load chapters: {(chapters.error as Error).message}
        </p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <main className="p-xl">
      <Link href="/learn/library" className="text-sm text-muted-foreground hover:underline">
        ← Library
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Chapters</h1>
      {bookNode && (
        <div className="mt-sm max-w-[24rem]">
          <ProgressBar
            percent={computeLessonCompletionPercent(bookNode)}
            label="Overall progress"
          />
        </div>
      )}

      {chapters.data.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No chapters yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {chapters.data.map((chapter) => (
            <ChapterRow
              key={chapter.id}
              chapter={chapter}
              chapterNode={chapterProgress.get(chapter.id)}
              bookId={bookId}
              isAdmin={isAdmin}
              isExpanded={expandedChapterId === chapter.id}
              onToggle={() =>
                setExpandedChapterId((current) => (current === chapter.id ? null : chapter.id))
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
            createChapterMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-foreground">New chapter</h2>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}
          <Button type="submit" disabled={createChapterMutation.isPending} className="self-start">
            {createChapterMutation.isPending ? "Creating..." : "Create chapter"}
          </Button>
        </form>
      )}
    </main>
  );
}

export default function BookPage() {
  const params = useParams<{ bookId: string }>();
  if (params.bookId === "uncategorized") {
    return <UncategorizedLessonsPage />;
  }
  return <BookChaptersPage bookId={params.bookId} />;
}
