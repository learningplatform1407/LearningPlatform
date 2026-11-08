import { lessonStatusLabel } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { computeLessonCompletionPercent } from "@lp/api-client";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { sha256Hex } from "@/lib/checksum";
import { ProgressBar } from "@/lib/progress-bar";
import { supabase } from "@/lib/supabase";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";
import { useI18n } from "@/lib/i18n";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function UncategorizedLessonsScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getApiClient().listDocuments("none"),
  });
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });
  const lessonProgress = new Map<string, BankTreeLesson>(
    tree.data?.uncategorized_lessons.map((lesson) => [lesson.id, lesson]),
  );

  const [title, setTitle] = useState("");
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pickedFile) throw new Error(t("book.choosePdfFirst"));
      if (pickedFile.mimeType !== "application/pdf") {
        throw new Error(t("book.onlyPdf"));
      }
      if (pickedFile.size && pickedFile.size > MAX_UPLOAD_BYTES) {
        throw new Error(t("book.fileTooLarge"));
      }

      const client = getApiClient();
      const { storage_path, token } = await client.requestDocumentUploadUrl({
        filename: pickedFile.name,
        mime_type: "application/pdf",
        size_bytes: pickedFile.size ?? 0,
      });

      const blob = await (await fetch(pickedFile.uri)).blob();
      const { error: uploadStorageError } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(storage_path, token, blob, { contentType: "application/pdf" });
      if (uploadStorageError) throw uploadStorageError;

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const checksum = await sha256Hex(bytes);

      return client.createDocument({
        title,
        storage_path,
        mime_type: "application/pdf",
        size_bytes: pickedFile.size ?? bytes.byteLength,
        checksum,
      });
    },
    onSuccess: () => {
      setTitle("");
      setPickedFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents", "uncategorized"] });
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : t("book.uploadFailed"));
    },
  });

  async function handlePickFile() {
    setUploadError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPickedFile(asset);
  }

  if (me.isPending || uncategorized.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const lessons = uncategorized.data ?? [];

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={lessons}
      keyExtractor={(doc) => doc.id}
      ListHeaderComponent={
        <ScreenHeader kicker={t("library.title")} title={t("library.uncategorized")} />
      }
      ListEmptyComponent={<Text style={styles.empty}>{t("book.noLessons")}</Text>}
      renderItem={({ item }) => (
        <View>
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/learn/${item.id}`)}
            accessibilityRole="button"
          >
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowStatus}>{lessonStatusLabel(t, item.status)}</Text>
          </Pressable>
          <ProgressBar
            percent={computeLessonCompletionPercent(
              lessonProgress.get(item.id) ?? {
                eligible_lesson_count: 0,
                completed_lesson_count: 0,
              },
            )}
          />
          {isAdmin && (
            <LessonAdminControls
              documentId={item.id}
              onDone={() =>
                queryClient.invalidateQueries({ queryKey: ["documents", "uncategorized"] })
              }
            />
          )}
        </View>
      )}
      ListFooterComponent={
        isAdmin ? (
          <View style={styles.uploadForm}>
            <Text style={styles.uploadHeading}>{t("book.uploadLesson")}</Text>
            <Text style={styles.label}>{t("book.title")}</Text>
            <TextInput
              testID="lesson-title-input"
              style={styles.input}
              value={title}
              onChangeText={setTitle}
            />

            <Pressable
              testID="new-lesson-file-picker"
              style={styles.button}
              onPress={handlePickFile}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>
                {pickedFile ? pickedFile.name : t("book.choosePdf")}
              </Text>
            </Pressable>

            {uploadError && <Text style={styles.error}>{uploadError}</Text>}

            <Pressable
              testID="new-lesson-upload-button"
              style={[styles.button, styles.uploadButton]}
              onPress={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !title || !pickedFile}
              accessibilityRole="button"
            >
              {uploadMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.uploadButtonText}>{t("book.upload")}</Text>
              )}
            </Pressable>
          </View>
        ) : undefined
      }
    />
  );
}

/** Per-lesson admin controls for the two independent upload pipelines: the
 * routine "lecture text" (hash-matches text blocks so highlights/notes on
 * unchanged content carry forward) and the rare "lecture PDF" (the official
 * reference book -- a replace always wipes every learner's ink on this
 * lesson unconditionally, hence the two-step confirmation). */
function LessonAdminControls({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const [textFile, setTextFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [confirmingPdfReplace, setConfirmingPdfReplace] = useState(false);

  async function pickFile(onPicked: (asset: DocumentPicker.DocumentPickerAsset) => void) {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onPicked(asset);
  }

  async function uploadAndChecksum(asset: DocumentPicker.DocumentPickerAsset) {
    if (asset.mimeType !== "application/pdf") throw new Error(t("book.onlyPdf"));
    if (asset.size && asset.size > MAX_UPLOAD_BYTES) throw new Error(t("book.fileTooLarge"));

    const client = getApiClient();
    const { storage_path, token } = await client.requestDocumentUploadUrl({
      filename: asset.name,
      mime_type: "application/pdf",
      size_bytes: asset.size ?? 0,
    });

    const blob = await (await fetch(asset.uri)).blob();
    const { error: uploadStorageError } = await supabase.storage
      .from("documents")
      .uploadToSignedUrl(storage_path, token, blob, { contentType: "application/pdf" });
    if (uploadStorageError) throw uploadStorageError;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const checksum = await sha256Hex(bytes);
    return {
      storage_path,
      mime_type: "application/pdf" as const,
      size_bytes: asset.size ?? bytes.byteLength,
      checksum,
    };
  }

  const replaceTextMutation = useMutation({
    mutationFn: async () => {
      if (!textFile) throw new Error(t("book.choosePdfFirst"));
      const payload = await uploadAndChecksum(textFile);
      return getApiClient().replaceLectureText(documentId, payload);
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
      return getApiClient().upsertLecturePdf(documentId, payload);
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
    <View testID={`lesson-admin-controls-${documentId}`} style={styles.adminControls}>
      <Text style={styles.uploadHeading}>{t("book.replaceText")}</Text>
      <Pressable
        testID={`lesson-text-file-picker-${documentId}`}
        style={styles.button}
        onPress={() =>
          pickFile((asset) => {
            setTextError(null);
            setTextFile(asset);
          })
        }
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{textFile ? textFile.name : t("book.choosePdf")}</Text>
      </Pressable>
      {textError && <Text style={styles.error}>{textError}</Text>}
      <Pressable
        style={[styles.button, styles.uploadButton]}
        onPress={() => {
          setTextError(null);
          replaceTextMutation.mutate();
        }}
        disabled={replaceTextMutation.isPending || !textFile}
        accessibilityRole="button"
      >
        {replaceTextMutation.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.uploadButtonText}>{t("book.replace")}</Text>
        )}
      </Pressable>

      <Text style={[styles.uploadHeading, styles.adminControlsSpaced]}>{t("book.replacePdf")}</Text>
      <Pressable
        testID={`lesson-pdf-file-picker-${documentId}`}
        style={styles.button}
        onPress={() =>
          pickFile((asset) => {
            setPdfError(null);
            setPdfFile(asset);
            setConfirmingPdfReplace(false);
          })
        }
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{pdfFile ? pdfFile.name : t("book.choosePdf")}</Text>
      </Pressable>
      {pdfError && <Text style={styles.error}>{pdfError}</Text>}
      {!confirmingPdfReplace ? (
        <Pressable
          style={[styles.button, styles.uploadButton]}
          onPress={() => setConfirmingPdfReplace(true)}
          disabled={!pdfFile}
          accessibilityRole="button"
        >
          <Text style={styles.uploadButtonText}>{t("book.upload")}</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.error}>{t("book.wipeInkWarning")}</Text>
          <Pressable
            style={[styles.button, styles.dangerButton]}
            onPress={() => {
              setPdfError(null);
              uploadPdfMutation.mutate();
            }}
            disabled={uploadPdfMutation.isPending}
            accessibilityRole="button"
          >
            {uploadPdfMutation.isPending ? (
              <ActivityIndicator color={colors.dangerForeground} />
            ) : (
              <Text style={styles.uploadButtonText}>{t("book.confirmWipe")}</Text>
            )}
          </Pressable>
          <Pressable onPress={() => setConfirmingPdfReplace(false)} accessibilityRole="button">
            <Text style={styles.label}>{t("common.cancel")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function LessonList({
  subChapterId,
  isAdmin,
  onUploaded,
  lessonProgress,
}: {
  subChapterId: string;
  isAdmin: boolean;
  onUploaded?: () => void;
  lessonProgress: Map<string, BankTreeLesson>;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ["documents", subChapterId],
    queryFn: () => getApiClient().listDocuments(subChapterId),
  });

  const [title, setTitle] = useState("");
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pickedFile) throw new Error(t("book.choosePdfFirst"));
      if (pickedFile.mimeType !== "application/pdf") {
        throw new Error(t("book.onlyPdf"));
      }
      if (pickedFile.size && pickedFile.size > MAX_UPLOAD_BYTES) {
        throw new Error(t("book.fileTooLarge"));
      }

      const client = getApiClient();
      const { storage_path, token } = await client.requestDocumentUploadUrl({
        filename: pickedFile.name,
        mime_type: "application/pdf",
        size_bytes: pickedFile.size ?? 0,
      });

      const blob = await (await fetch(pickedFile.uri)).blob();
      const { error: uploadStorageError } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(storage_path, token, blob, { contentType: "application/pdf" });
      if (uploadStorageError) throw uploadStorageError;

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const checksum = await sha256Hex(bytes);

      return client.createDocument({
        title,
        storage_path,
        mime_type: "application/pdf",
        size_bytes: pickedFile.size ?? bytes.byteLength,
        checksum,
        sub_chapter_id: subChapterId === "none" ? undefined : subChapterId,
      });
    },
    onSuccess: () => {
      setTitle("");
      setPickedFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents", subChapterId] });
      onUploaded?.();
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : t("book.uploadFailed"));
    },
  });

  async function handlePickFile() {
    setUploadError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPickedFile(asset);
  }

  if (documents.isPending) {
    return <Text style={styles.loading}>{t("common.loading")}</Text>;
  }

  if (documents.isError) {
    return (
      <Text style={styles.error}>
        {t("book.loadLessonsFailed", { message: (documents.error as Error).message })}
      </Text>
    );
  }

  return (
    <View style={styles.lessonListContent}>
      {documents.data.length === 0 ? (
        <Text style={styles.empty}>{t("book.noLessons")}</Text>
      ) : (
        documents.data.map((item) => (
          <View key={item.id}>
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/learn/${item.id}`)}
              accessibilityRole="button"
            >
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowStatus}>{lessonStatusLabel(t, item.status)}</Text>
            </Pressable>
            <ProgressBar
              percent={computeLessonCompletionPercent(
                lessonProgress.get(item.id) ?? {
                  eligible_lesson_count: 0,
                  completed_lesson_count: 0,
                },
              )}
            />
            {isAdmin && (
              <LessonAdminControls
                documentId={item.id}
                onDone={() =>
                  queryClient.invalidateQueries({ queryKey: ["documents", subChapterId] })
                }
              />
            )}
          </View>
        ))
      )}

      {isAdmin && (
        <View style={styles.uploadForm}>
          <Text style={styles.uploadHeading}>{t("book.uploadLesson")}</Text>
          <Text style={styles.label}>{t("book.title")}</Text>
          <TextInput
            testID="lesson-title-input"
            style={styles.input}
            value={title}
            onChangeText={setTitle}
          />

          <Pressable
            testID="new-lesson-file-picker"
            style={styles.button}
            onPress={handlePickFile}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {pickedFile ? pickedFile.name : t("book.choosePdf")}
            </Text>
          </Pressable>

          {uploadError && <Text style={styles.error}>{uploadError}</Text>}

          <Pressable
            testID="new-lesson-upload-button"
            style={[styles.button, styles.uploadButton]}
            onPress={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending || !title || !pickedFile}
            accessibilityRole="button"
          >
            {uploadMutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.uploadButtonText}>{t("book.upload")}</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SubChapterRow({
  subChapter,
  subChapterNode,
  isAdmin,
  isExpanded,
  onToggle,
  onUploaded,
}: {
  subChapter: { id: string; title: string; lesson_count: number };
  subChapterNode: BankTreeSubChapter | undefined;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onUploaded: () => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const lessonProgress = new Map<string, BankTreeLesson>(
    subChapterNode?.lessons.map((lesson) => [lesson.id, lesson]),
  );
  return (
    <View style={styles.subChapterCard}>
      <Pressable
        style={styles.subChapterHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.rowTitle}>{subChapter.title}</Text>
        <Text style={styles.rowStatus}>
          {t("library.lessons", { count: subChapter.lesson_count })} {isExpanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {subChapterNode && (
        <View style={styles.progressWrapper}>
          <ProgressBar percent={computeLessonCompletionPercent(subChapterNode)} />
        </View>
      )}
      {isExpanded && (
        <View style={styles.subChapterBody}>
          <LessonList
            subChapterId={subChapter.id}
            isAdmin={isAdmin}
            onUploaded={onUploaded}
            lessonProgress={lessonProgress}
          />
        </View>
      )}
    </View>
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
  const styles = useStyles();
  const colors = useThemeColors();
  const subChapterProgress = new Map<string, BankTreeSubChapter>(
    chapterNode?.sub_chapters.map((subChapter) => [subChapter.id, subChapter]),
  );
  const queryClient = useQueryClient();
  const subChapters = useQuery({
    queryKey: ["sub-chapters", chapter.id],
    queryFn: () => getApiClient().listSubChapters(chapter.id),
    enabled: isExpanded,
  });

  const [expandedSubChapterId, setExpandedSubChapterId] = useState<string | null>(null);
  const [newSubChapterTitle, setNewSubChapterTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createSubChapterMutation = useMutation({
    mutationFn: () => getApiClient().createSubChapter(chapter.id, { title: newSubChapterTitle }),
    onSuccess: () => {
      setNewSubChapterTitle("");
      queryClient.invalidateQueries({ queryKey: ["sub-chapters", chapter.id] });
      queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : t("book.createSubChapterFailed"));
    },
  });

  function invalidateSubChapters() {
    queryClient.invalidateQueries({ queryKey: ["sub-chapters", chapter.id] });
  }

  return (
    <View style={styles.chapterCard}>
      <Pressable
        style={styles.chapterHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.rowTitle}>{chapter.title}</Text>
        <Text style={styles.rowStatus}>
          {t("library.subChapters", { count: chapter.sub_chapter_count })} {isExpanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {chapterNode && (
        <View style={styles.progressWrapper}>
          <ProgressBar percent={computeLessonCompletionPercent(chapterNode)} />
        </View>
      )}
      {isExpanded && (
        <View style={styles.chapterBody}>
          {subChapters.isPending ? (
            <Text style={styles.loading}>{t("common.loading")}</Text>
          ) : subChapters.isError ? (
            <Text style={styles.error}>
              {t("book.loadSubChaptersFailed", { message: (subChapters.error as Error).message })}
            </Text>
          ) : subChapters.data.length === 0 ? (
            <Text style={styles.empty}>{t("book.noSubChapters")}</Text>
          ) : (
            <View style={styles.subChapterList}>
              {subChapters.data.map((subChapter) => (
                <SubChapterRow
                  key={subChapter.id}
                  subChapter={subChapter}
                  subChapterNode={subChapterProgress.get(subChapter.id)}
                  isAdmin={isAdmin}
                  isExpanded={expandedSubChapterId === subChapter.id}
                  onToggle={() =>
                    setExpandedSubChapterId((current) =>
                      current === subChapter.id ? null : subChapter.id,
                    )
                  }
                  onUploaded={invalidateSubChapters}
                />
              ))}
            </View>
          )}

          {isAdmin && (
            <View style={styles.uploadForm}>
              <Text style={styles.uploadHeading}>{t("book.newSubChapter")}</Text>
              <Text style={styles.label}>{t("book.title")}</Text>
              <TextInput
                testID="sub-chapter-title-input"
                style={styles.input}
                value={newSubChapterTitle}
                onChangeText={setNewSubChapterTitle}
              />

              {createError && <Text style={styles.error}>{createError}</Text>}

              <Pressable
                style={[styles.button, styles.uploadButton]}
                onPress={() => createSubChapterMutation.mutate()}
                disabled={createSubChapterMutation.isPending || !newSubChapterTitle}
                accessibilityRole="button"
              >
                {createSubChapterMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.uploadButtonText}>{t("book.createSubChapter")}</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function BookChaptersScreen({ bookId }: { bookId: string }) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters", bookId],
    queryFn: () => getApiClient().listChapters(bookId),
  });
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });
  const bookNode = tree.data?.books.find((book) => book.id === bookId);
  // The book's own name as the screen title; the library list it was opened
  // from is cached, so it's there on the first frame.
  const books = useQuery({ queryKey: ["books"], queryFn: () => getApiClient().listBooks() });
  const bookTitle = books.data?.find((book) => book.id === bookId)?.title;
  const chapterProgress = new Map<string, BankTreeChapter>(
    bookNode?.chapters.map((chapter) => [chapter.id, chapter]),
  );

  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createChapterMutation = useMutation({
    mutationFn: () => getApiClient().createChapter(bookId, { title }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : t("book.createChapterFailed"));
    },
  });

  if (me.isPending || chapters.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (chapters.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          {t("book.loadChaptersFailed", { message: (chapters.error as Error).message })}
        </Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={chapters.data}
      keyExtractor={(chapter) => chapter.id}
      ListHeaderComponent={
        <>
          <ScreenHeader kicker={t("book.kicker")} title={bookTitle ?? t("book.chapters")} />
          {bookNode && (
            <View style={styles.overallProgress}>
              <ProgressBar
                percent={computeLessonCompletionPercent(bookNode)}
                label={t("book.overallProgress")}
              />
            </View>
          )}
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t("book.noChapters")}</Text>}
      renderItem={({ item }) => (
        <ChapterRow
          chapter={item}
          chapterNode={chapterProgress.get(item.id)}
          bookId={bookId}
          isAdmin={isAdmin}
          isExpanded={expandedChapterId === item.id}
          onToggle={() => setExpandedChapterId((current) => (current === item.id ? null : item.id))}
        />
      )}
      ListFooterComponent={
        isAdmin ? (
          <View style={styles.uploadForm}>
            <Text style={styles.uploadHeading}>{t("book.newChapter")}</Text>
            <Text style={styles.label}>{t("book.title")}</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />

            {createError && <Text style={styles.error}>{createError}</Text>}

            <Pressable
              style={[styles.button, styles.uploadButton]}
              onPress={() => createChapterMutation.mutate()}
              disabled={createChapterMutation.isPending || !title}
              accessibilityRole="button"
            >
              {createChapterMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.uploadButtonText}>{t("book.createChapter")}</Text>
              )}
            </Pressable>
          </View>
        ) : undefined
      }
    />
  );
}

export default function BookScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  if (bookId === "uncategorized") {
    return <UncategorizedLessonsScreen />;
  }
  return <BookChaptersScreen bookId={bookId} />;
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.xs,
  },
  lessonListContent: {
    gap: spacing.xs,
  },
  progressWrapper: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  overallProgress: {
    marginTop: spacing.xs,
    maxWidth: 384,
  },
  empty: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  chapterCard: {
    borderWidth: 0,
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 0,
  },
  chapterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chapterBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  subChapterList: {
    gap: spacing.xs,
  },
  subChapterCard: {
    borderWidth: 0,
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 0,
  },
  subChapterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  subChapterBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  rowStatus: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  uploadForm: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  adminControls: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.muted,
    gap: spacing.xs,
  },
  adminControlsSpaced: {
    marginTop: spacing.sm,
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  uploadHeading: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  label: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  buttonText: {
    color: colors.foreground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  uploadButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: 10,
  },
  uploadButtonText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
}));
