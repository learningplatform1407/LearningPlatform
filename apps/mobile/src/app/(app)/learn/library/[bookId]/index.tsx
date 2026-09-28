import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import { sha256Hex } from "@/lib/checksum";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

function UncategorizedLessonsScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getApiClient().listDocuments("none"),
  });

  const [title, setTitle] = useState("");
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pickedFile) throw new Error("Choose a PDF file first.");
      if (pickedFile.mimeType !== "application/pdf") {
        throw new Error("Only PDF files are supported.");
      }
      if (pickedFile.size && pickedFile.size > MAX_UPLOAD_BYTES) {
        throw new Error("File must be under 50MB.");
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
      setUploadError(err instanceof Error ? err.message : "Failed to upload document.");
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
        <Text style={styles.loading}>Loading...</Text>
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
        <>
          <Pressable onPress={() => router.push("/learn/library")} accessibilityRole="button">
            <Text style={styles.backLink}>← Library</Text>
          </Pressable>
          <Text style={styles.title}>Uncategorized</Text>
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>No lessons yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/learn/${item.id}`)}
          accessibilityRole="button"
        >
          <Text style={styles.rowTitle}>{item.title}</Text>
          <Text style={styles.rowStatus}>
            {item.status ? (STATUS_LABEL[item.status] ?? item.status) : ""}
          </Text>
        </Pressable>
      )}
      ListFooterComponent={
        isAdmin ? (
          <View style={styles.uploadForm}>
            <Text style={styles.uploadHeading}>Upload a lesson</Text>
            <Text style={styles.label}>Title</Text>
            <TextInput
              testID="lesson-title-input"
              style={styles.input}
              value={title}
              onChangeText={setTitle}
            />

            <Pressable style={styles.button} onPress={handlePickFile} accessibilityRole="button">
              <Text style={styles.buttonText}>
                {pickedFile ? pickedFile.name : "Choose PDF file"}
              </Text>
            </Pressable>

            {uploadError && <Text style={styles.error}>{uploadError}</Text>}

            <Pressable
              style={[styles.button, styles.uploadButton]}
              onPress={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !title || !pickedFile}
              accessibilityRole="button"
            >
              {uploadMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.uploadButtonText}>Upload</Text>
              )}
            </Pressable>
          </View>
        ) : null
      }
    />
  );
}

function LessonList({
  subChapterId,
  isAdmin,
  onUploaded,
}: {
  subChapterId: string;
  isAdmin: boolean;
  onUploaded?: () => void;
}) {
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
      if (!pickedFile) throw new Error("Choose a PDF file first.");
      if (pickedFile.mimeType !== "application/pdf") {
        throw new Error("Only PDF files are supported.");
      }
      if (pickedFile.size && pickedFile.size > MAX_UPLOAD_BYTES) {
        throw new Error("File must be under 50MB.");
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
      setUploadError(err instanceof Error ? err.message : "Failed to upload document.");
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
    return <Text style={styles.loading}>Loading...</Text>;
  }

  if (documents.isError) {
    return (
      <Text style={styles.error}>Failed to load lessons: {(documents.error as Error).message}</Text>
    );
  }

  return (
    <View style={styles.lessonListContent}>
      {documents.data.length === 0 ? (
        <Text style={styles.empty}>No lessons yet.</Text>
      ) : (
        documents.data.map((item) => (
          <Pressable
            key={item.id}
            style={styles.row}
            onPress={() => router.push(`/learn/${item.id}`)}
            accessibilityRole="button"
          >
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowStatus}>
              {item.status ? (STATUS_LABEL[item.status] ?? item.status) : ""}
            </Text>
          </Pressable>
        ))
      )}

      {isAdmin && (
        <View style={styles.uploadForm}>
          <Text style={styles.uploadHeading}>Upload a lesson</Text>
          <Text style={styles.label}>Title</Text>
          <TextInput
            testID="lesson-title-input"
            style={styles.input}
            value={title}
            onChangeText={setTitle}
          />

          <Pressable style={styles.button} onPress={handlePickFile} accessibilityRole="button">
            <Text style={styles.buttonText}>
              {pickedFile ? pickedFile.name : "Choose PDF file"}
            </Text>
          </Pressable>

          {uploadError && <Text style={styles.error}>{uploadError}</Text>}

          <Pressable
            style={[styles.button, styles.uploadButton]}
            onPress={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending || !title || !pickedFile}
            accessibilityRole="button"
          >
            {uploadMutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.uploadButtonText}>Upload</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SubChapterRow({
  subChapter,
  isAdmin,
  isExpanded,
  onToggle,
  onUploaded,
}: {
  subChapter: { id: string; title: string; lesson_count: number };
  isAdmin: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onUploaded: () => void;
}) {
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
          {subChapter.lesson_count} {subChapter.lesson_count === 1 ? "lesson" : "lessons"}{" "}
          {isExpanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {isExpanded && (
        <View style={styles.subChapterBody}>
          <LessonList subChapterId={subChapter.id} isAdmin={isAdmin} onUploaded={onUploaded} />
        </View>
      )}
    </View>
  );
}

function ChapterRow({
  chapter,
  bookId,
  isAdmin,
  isExpanded,
  onToggle,
}: {
  chapter: { id: string; title: string; sub_chapter_count: number };
  bookId: string;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
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
      setCreateError(err instanceof Error ? err.message : "Failed to create sub-chapter.");
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
          {chapter.sub_chapter_count}{" "}
          {chapter.sub_chapter_count === 1 ? "sub-chapter" : "sub-chapters"}{" "}
          {isExpanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {isExpanded && (
        <View style={styles.chapterBody}>
          {subChapters.isPending ? (
            <Text style={styles.loading}>Loading...</Text>
          ) : subChapters.isError ? (
            <Text style={styles.error}>
              Failed to load sub-chapters: {(subChapters.error as Error).message}
            </Text>
          ) : subChapters.data.length === 0 ? (
            <Text style={styles.empty}>No sub-chapters yet.</Text>
          ) : (
            <View style={styles.subChapterList}>
              {subChapters.data.map((subChapter) => (
                <SubChapterRow
                  key={subChapter.id}
                  subChapter={subChapter}
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
              <Text style={styles.uploadHeading}>New sub-chapter</Text>
              <Text style={styles.label}>Title</Text>
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
                  <Text style={styles.uploadButtonText}>Create sub-chapter</Text>
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
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters", bookId],
    queryFn: () => getApiClient().listChapters(bookId),
  });

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
      setCreateError(err instanceof Error ? err.message : "Failed to create chapter.");
    },
  });

  if (me.isPending || chapters.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (chapters.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          Failed to load chapters: {(chapters.error as Error).message}
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
          <Pressable onPress={() => router.push("/learn/library")} accessibilityRole="button">
            <Text style={styles.backLink}>← Library</Text>
          </Pressable>
          <Text style={styles.title}>Chapters</Text>
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>No chapters yet.</Text>}
      renderItem={({ item }) => (
        <ChapterRow
          chapter={item}
          bookId={bookId}
          isAdmin={isAdmin}
          isExpanded={expandedChapterId === item.id}
          onToggle={() => setExpandedChapterId((current) => (current === item.id ? null : item.id))}
        />
      )}
      ListFooterComponent={
        isAdmin ? (
          <View style={styles.uploadForm}>
            <Text style={styles.uploadHeading}>New chapter</Text>
            <Text style={styles.label}>Title</Text>
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
                <Text style={styles.uploadButtonText}>Create chapter</Text>
              )}
            </Pressable>
          </View>
        ) : null
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

const styles = StyleSheet.create({
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
  backLink: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  empty: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  chapterCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
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
});
