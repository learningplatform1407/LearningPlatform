"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { computeLessonCompletionPercent } from "@lp/api-client";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageMain } from "@/components/page-main";
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

/** The book-detail content, shared by the regular `/learn/library/[bookId]`
 * route (`showAdminTools` always false -- creating/uploading content is an
 * admin tool, not something that belongs on the page every learner browses)
 * and `/admin/library/[bookId]` (`showAdminTools` true, after its own role
 * gate). */
export function UncategorizedLessonsPage({ showAdminTools }: { showAdminTools: boolean }) {
  const queryClient = useQueryClient();
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

  if (uncategorized.isPending) {
    return (
      <PageMain>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <h1 className="text-2xl font-bold text-foreground">Uncategorized</h1>
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
                {showAdminTools && (
                  <LessonAdminControls
                    documentId={doc.id}
                    onDone={() =>
                      queryClient.invalidateQueries({ queryKey: ["documents", "uncategorized"] })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {showAdminTools && (
          <form
            className="mt-lg flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
            onSubmit={(event) => {
              event.preventDefault();
              setUploadError(null);
              uploadMutation.mutate();
            }}
          >
            <h3 className="text-sm font-semibold text-foreground">Upload a new lesson</h3>
            <label className="flex flex-col gap-xs text-sm text-foreground">
              Title
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className="field"
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
    </PageMain>
  );
}

/** Per-lesson admin controls for the two independent upload pipelines: the
 * routine "lecture text" (hash-matches text blocks so highlights/notes on
 * unchanged content carry forward) and the rare "lecture PDF" (the official
 * reference book -- a replace always wipes every learner's ink on this
 * lesson unconditionally, hence the two-step confirmation). */
function LessonAdminControls({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const [textFile, setTextFile] = useState<File | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [confirmingPdfReplace, setConfirmingPdfReplace] = useState(false);

  async function uploadAndChecksum(file: File) {
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
    return { storage_path, mime_type: "application/pdf" as const, size_bytes: file.size, checksum };
  }

  const replaceTextMutation = useMutation({
    mutationFn: async () => {
      if (!textFile) throw new Error("Choose a PDF file first.");
      const payload = await uploadAndChecksum(textFile);
      return getBrowserApiClient().replaceLectureText(documentId, payload);
    },
    onSuccess: () => {
      setTextFile(null);
      onDone();
    },
    onError: (err) => {
      setTextError(err instanceof Error ? err.message : "Failed to replace lecture text.");
    },
  });

  const uploadPdfMutation = useMutation({
    mutationFn: async () => {
      if (!pdfFile) throw new Error("Choose a PDF file first.");
      const payload = await uploadAndChecksum(pdfFile);
      return getBrowserApiClient().upsertLecturePdf(documentId, payload);
    },
    // Processing happens inline, so a PDF that fails validation still comes
    // back 200 with status "failed". Treating every 200 as success meant an
    // admin uploading a corrupt file saw nothing wrong here, while learners
    // silently never got the PDF/Text toggle. `error_message` carries the
    // backend's own reason (e.g. a checksum mismatch).
    onSuccess: (lecturePdf) => {
      if (lecturePdf.status !== "ready") {
        setPdfError(lecturePdf.error_message ?? "The PDF could not be processed.");
        return;
      }
      setPdfFile(null);
      setConfirmingPdfReplace(false);
      onDone();
    },
    onError: (err) => {
      setPdfError(err instanceof Error ? err.message : "Failed to upload lecture PDF.");
    },
  });

  return (
    <div className="mt-sm flex flex-col gap-sm rounded-md bg-muted/50 p-sm">
      <form
        className="flex flex-wrap items-center gap-xs"
        onSubmit={(event) => {
          event.preventDefault();
          setTextError(null);
          replaceTextMutation.mutate();
        }}
      >
        <span className="text-xs font-medium text-foreground">Replace lecture text</span>
        <input
          type="file"
          accept="application/pdf"
          aria-label="Lecture text PDF"
          onChange={(event) => setTextFile(event.target.files?.[0] ?? null)}
          className="text-xs"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={!textFile || replaceTextMutation.isPending}
          className="px-sm py-xs text-xs"
        >
          {replaceTextMutation.isPending ? "Replacing..." : "Replace"}
        </Button>
      </form>
      {textError && (
        <p role="alert" className="text-xs text-danger">
          {textError}
        </p>
      )}

      <form
        className="flex flex-wrap items-center gap-xs"
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmingPdfReplace) {
            setConfirmingPdfReplace(true);
            return;
          }
          setPdfError(null);
          uploadPdfMutation.mutate();
        }}
      >
        <span className="text-xs font-medium text-foreground">Upload/replace lecture PDF</span>
        <input
          type="file"
          accept="application/pdf"
          aria-label="Lecture PDF"
          onChange={(event) => {
            setPdfFile(event.target.files?.[0] ?? null);
            setConfirmingPdfReplace(false);
          }}
          className="text-xs"
        />
        {!confirmingPdfReplace ? (
          <Button
            type="submit"
            variant="secondary"
            disabled={!pdfFile}
            className="px-sm py-xs text-xs"
          >
            Upload
          </Button>
        ) : (
          <>
            <span role="alert" className="text-xs text-danger">
              This permanently wipes every learner&apos;s ink on this lesson&apos;s PDF — there is
              no way to get it back.
            </span>
            <Button
              type="submit"
              variant="danger"
              disabled={uploadPdfMutation.isPending}
              className="px-sm py-xs text-xs"
            >
              {uploadPdfMutation.isPending ? "Replacing..." : "Yes, replace and wipe all ink"}
            </Button>
            <button
              type="button"
              onClick={() => setConfirmingPdfReplace(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </>
        )}
      </form>
      {pdfError && (
        <p role="alert" className="text-xs text-danger">
          {pdfError}
        </p>
      )}
    </div>
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
              {isAdmin && (
                <LessonAdminControls
                  documentId={doc.id}
                  onDone={() =>
                    queryClient.invalidateQueries({ queryKey: ["documents", subChapterId] })
                  }
                />
              )}
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
          <h3 className="text-sm font-semibold text-foreground">Upload a new lesson</h3>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="field"
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
                  className="field"
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

export function BookChaptersPage({
  bookId,
  showAdminTools,
}: {
  bookId: string;
  showAdminTools: boolean;
}) {
  const queryClient = useQueryClient();
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

  if (chapters.isPending) {
    return (
      <PageMain>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageMain>
    );
  }

  if (chapters.isError) {
    return (
      <PageMain>
        <p role="alert" className="text-sm text-danger">
          Failed to load chapters: {(chapters.error as Error).message}
        </p>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <h1 className="text-2xl font-bold text-foreground">Chapters</h1>
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
              isAdmin={showAdminTools}
              isExpanded={expandedChapterId === chapter.id}
              onToggle={() =>
                setExpandedChapterId((current) => (current === chapter.id ? null : chapter.id))
              }
            />
          ))}
        </ul>
      )}

      {showAdminTools && (
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
              className="field"
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
    </PageMain>
  );
}
