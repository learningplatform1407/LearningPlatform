"use client";

import { lessonStatusLabel } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { computeLessonCompletionPercent } from "@lp/api-client";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { ProgressBar } from "@/components/progress-bar";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { sha256Hex } from "@/lib/checksum";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** The book-detail content, shared by the regular `/learn/library/[bookId]`
 * route (`showAdminTools` always false -- creating/uploading content is an
 * admin tool, not something that belongs on the page every learner browses)
 * and `/admin/library/[bookId]` (`showAdminTools` true, after its own role
 * gate). */
export function UncategorizedLessonsPage({ showAdminTools }: { showAdminTools: boolean }) {
  const { t } = useI18n();
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
      if (!file) throw new Error(t("book.choosePdfFirst"));
      if (file.type !== "application/pdf") throw new Error(t("book.onlyPdf"));
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(t("book.fileTooLarge"));

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
      setUploadError(err instanceof Error ? err.message : t("book.uploadFailed"));
    },
  });

  if (uncategorized.isPending) {
    return (
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("library.title")} title={t("library.uncategorized")} />
      <div className="mt-lg">
        {uncategorized.data && uncategorized.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("book.noLessons")}</p>
        ) : (
          <ul>
            {uncategorized.data?.map((doc) => (
              <li key={doc.id} className="border-t border-border py-2.5 first:border-t-0">
                <Link
                  href={`/learn/${doc.id}`}
                  className="group flex items-center justify-between gap-md"
                >
                  <span className="text-ui font-semibold text-foreground group-hover:underline">
                    {doc.title}
                  </span>
                  <span className="shrink-0 text-caption font-semibold text-muted-foreground">
                    {lessonStatusLabel(t, doc.status)}
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
            <h3 className="label-caps">{t("book.uploadNewLesson")}</h3>
            <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
              {t("book.title")}
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className="field"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
              {t("book.pdfFile")}
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
              {uploadMutation.isPending ? t("book.uploading") : t("book.upload")}
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
  const { t } = useI18n();
  const [textFile, setTextFile] = useState<File | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [confirmingPdfReplace, setConfirmingPdfReplace] = useState(false);

  async function uploadAndChecksum(file: File) {
    if (file.type !== "application/pdf") throw new Error(t("book.onlyPdf"));
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(t("book.fileTooLarge"));

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
      if (!textFile) throw new Error(t("book.choosePdfFirst"));
      const payload = await uploadAndChecksum(textFile);
      return getBrowserApiClient().replaceLectureText(documentId, payload);
    },
    onSuccess: () => {
      setTextFile(null);
      onDone();
    },
    onError: (err) => {
      setTextError(err instanceof Error ? err.message : t("book.replaceTextFailed"));
    },
  });

  const uploadPdfMutation = useMutation({
    mutationFn: async () => {
      if (!pdfFile) throw new Error(t("book.choosePdfFirst"));
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
        setPdfError(lecturePdf.error_message ?? t("book.pdfNotProcessed"));
        return;
      }
      setPdfFile(null);
      setConfirmingPdfReplace(false);
      onDone();
    },
    onError: (err) => {
      setPdfError(err instanceof Error ? err.message : t("book.uploadPdfFailed"));
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
        <span className="text-xs font-medium text-foreground">{t("book.replaceText")}</span>
        <input
          type="file"
          accept="application/pdf"
          aria-label={t("book.lectureTextPdf")}
          onChange={(event) => setTextFile(event.target.files?.[0] ?? null)}
          className="text-xs"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={!textFile || replaceTextMutation.isPending}
          className="px-sm py-xs text-xs"
        >
          {replaceTextMutation.isPending ? t("book.replacing") : t("book.replace")}
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
        <span className="text-xs font-medium text-foreground">{t("book.replacePdf")}</span>
        <input
          type="file"
          accept="application/pdf"
          aria-label={t("book.lecturePdf")}
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
            {t("book.upload")}
          </Button>
        ) : (
          <>
            <span role="alert" className="text-xs text-danger">
              {t("book.wipeInkWarning")}
            </span>
            <Button
              type="submit"
              variant="danger"
              disabled={uploadPdfMutation.isPending}
              className="px-sm py-xs text-xs"
            >
              {uploadPdfMutation.isPending ? t("book.replacing") : t("book.confirmWipe")}
            </Button>
            <button
              type="button"
              onClick={() => setConfirmingPdfReplace(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              {t("common.cancel")}
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
  const { t } = useI18n();
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
      if (!file) throw new Error(t("book.choosePdfFirst"));
      if (file.type !== "application/pdf") throw new Error(t("book.onlyPdf"));
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(t("book.fileTooLarge"));

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
      setUploadError(err instanceof Error ? err.message : t("book.uploadFailed"));
    },
  });

  if (documents.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (documents.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("book.loadLessonsFailed", { message: (documents.error as Error).message })}
      </p>
    );
  }

  return (
    <div>
      {documents.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("book.noLessons")}</p>
      ) : (
        <ul>
          {documents.data.map((doc) => (
            <li key={doc.id} className="border-t border-border py-2.5 first:border-t-0">
              <Link
                href={`/learn/${doc.id}`}
                className="group flex items-center justify-between gap-md"
              >
                <span className="text-ui font-semibold text-foreground group-hover:underline">
                  {doc.title}
                </span>
                <span className="shrink-0 text-caption font-semibold text-muted-foreground">
                  {lessonStatusLabel(t, doc.status)}
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
          <h3 className="label-caps">{t("book.uploadNewLesson")}</h3>
          <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
            {t("book.title")}
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
            {t("book.pdfFile")}
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
            {uploadMutation.isPending ? t("book.uploading") : t("book.upload")}
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
  const { t } = useI18n();
  const lessonProgress = new Map<string, BankTreeLesson>(
    subChapterNode?.lessons.map((lesson) => [lesson.id, lesson]),
  );
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-sm py-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className={`text-lg leading-none font-semibold text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
        >
          ›
        </span>
        <span className="flex-1 text-toc font-bold text-foreground">{subChapter.title}</span>
        <span className="shrink-0 text-caption font-semibold text-muted-foreground">
          {t("library.lessons", { count: subChapter.lesson_count })}
        </span>
      </button>
      {subChapterNode && (
        <div className="pb-2.5 pl-lg">
          <ProgressBar percent={computeLessonCompletionPercent(subChapterNode)} />
        </div>
      )}
      {isExpanded && (
        <div className="pb-md pl-lg">
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
  const { t } = useI18n();
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
      setCreateError(err instanceof Error ? err.message : t("book.createSubChapterFailed"));
    },
  });

  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-sm py-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className={`text-lg leading-none font-semibold text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
        >
          ›
        </span>
        <span className="flex-1 text-toc font-bold text-foreground">{chapter.title}</span>
        <span className="shrink-0 text-caption font-semibold text-muted-foreground">
          {t("library.subChapters", { count: chapter.sub_chapter_count })}
        </span>
      </button>
      {chapterNode && (
        <div className="pb-2.5 pl-lg">
          <ProgressBar percent={computeLessonCompletionPercent(chapterNode)} />
        </div>
      )}
      {isExpanded && (
        <div className="pb-md pl-lg">
          {subChapters.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : subChapters.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t("book.loadSubChaptersFailed", { message: (subChapters.error as Error).message })}
            </p>
          ) : subChapters.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("book.noSubChapters")}</p>
          ) : (
            <ul>
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
              <h3 className="label-caps">{t("book.newSubChapter")}</h3>
              <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
                {t("book.title")}
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
                {createSubChapterMutation.isPending
                  ? t("book.creating")
                  : t("book.createSubChapter")}
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
  const { t } = useI18n();
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
  // The book's own name as the page title; the list it came from is usually
  // cached already, so it's there on the first frame.
  const books = useQuery({
    queryKey: ["books"],
    queryFn: () => getBrowserApiClient().listBooks(),
  });
  const bookTitle = books.data?.find((book) => book.id === bookId)?.title;
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
      setCreateError(err instanceof Error ? err.message : t("book.createChapterFailed"));
    },
  });

  if (chapters.isPending) {
    return (
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  if (chapters.isError) {
    return (
      <PageMain width="reading">
        <p role="alert" className="text-sm text-danger">
          {t("book.loadChaptersFailed", { message: (chapters.error as Error).message })}
        </p>
      </PageMain>
    );
  }

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("book.kicker")} title={bookTitle ?? t("book.chapters")} />
      {bookNode && (
        <div className="mt-sm max-w-[24rem]">
          <ProgressBar
            percent={computeLessonCompletionPercent(bookNode)}
            label={t("book.overallProgress")}
          />
        </div>
      )}

      {chapters.data.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">{t("book.noChapters")}</p>
      ) : (
        <ul className="mt-lg border-y border-border">
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
          <h2 className="label-caps">{t("book.newChapter")}</h2>
          <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
            {t("book.title")}
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
            {createChapterMutation.isPending ? t("book.creating") : t("book.createChapter")}
          </Button>
        </form>
      )}
    </PageMain>
  );
}
