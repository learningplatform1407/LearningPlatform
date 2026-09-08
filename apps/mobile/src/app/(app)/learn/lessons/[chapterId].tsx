import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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

export default function ChapterLessonsScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>();
  const isUncategorized = chapterId === "uncategorized";
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters"],
    queryFn: () => getApiClient().listChapters(),
    enabled: !isUncategorized,
  });
  const subChapters = useQuery({
    queryKey: ["sub-chapters", chapterId],
    queryFn: () => getApiClient().listSubChapters(chapterId),
    enabled: !isUncategorized,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubChapterTitle, setNewSubChapterTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createSubChapterMutation = useMutation({
    mutationFn: () => getApiClient().createSubChapter(chapterId, { title: newSubChapterTitle }),
    onSuccess: () => {
      setNewSubChapterTitle("");
      queryClient.invalidateQueries({ queryKey: ["sub-chapters", chapterId] });
      queryClient.invalidateQueries({ queryKey: ["chapters"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create sub-chapter.");
    },
  });

  function invalidateSubChapters() {
    queryClient.invalidateQueries({ queryKey: ["sub-chapters", chapterId] });
  }

  if (isUncategorized) {
    if (me.isPending) {
      return (
        <View style={styles.container}>
          <Text style={styles.loading}>Loading...</Text>
        </View>
      );
    }
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.push("/learn/lessons")} accessibilityRole="button">
          <Text style={styles.backLink}>← All chapters</Text>
        </Pressable>
        <Text style={styles.title}>Uncategorized</Text>
        <LessonList subChapterId="none" isAdmin={me.data?.role === "admin"} />
      </ScrollView>
    );
  }

  if (me.isPending || chapters.isPending || subChapters.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (subChapters.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          Failed to load sub-chapters: {(subChapters.error as Error).message}
        </Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const chapterTitle = chapters.data?.find((chapter) => chapter.id === chapterId)?.title;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/learn/lessons")} accessibilityRole="button">
        <Text style={styles.backLink}>← All chapters</Text>
      </Pressable>
      <Text style={styles.title}>{chapterTitle ?? "Chapter"}</Text>

      {subChapters.data.length === 0 ? (
        <Text style={styles.empty}>No sub-chapters yet.</Text>
      ) : (
        <View style={styles.subChapterList}>
          {subChapters.data.map((subChapter) => (
            <SubChapterRow
              key={subChapter.id}
              subChapter={subChapter}
              isAdmin={isAdmin}
              isExpanded={expandedId === subChapter.id}
              onToggle={() =>
                setExpandedId((current) => (current === subChapter.id ? null : subChapter.id))
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
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
