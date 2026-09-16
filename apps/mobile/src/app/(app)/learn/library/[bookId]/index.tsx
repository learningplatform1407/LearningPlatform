import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

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

interface ChapterRow {
  id: string;
  title: string;
  count: number;
  countLabel: string;
}

function BookChaptersScreen({ bookId }: { bookId: string }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters", bookId],
    queryFn: () => getApiClient().listChapters(bookId),
  });

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
        <Text style={styles.error}>Failed to load chapters: {(chapters.error as Error).message}</Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const rows: ChapterRow[] = chapters.data.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    count: chapter.sub_chapter_count,
    countLabel: chapter.sub_chapter_count === 1 ? "sub-chapter" : "sub-chapters",
  }));

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={rows}
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
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/learn/library/${bookId}/${item.id}`)}
          accessibilityRole="button"
        >
          <Text style={styles.rowTitle}>{item.title}</Text>
          <Text style={styles.rowStatus}>
            {item.count} {item.countLabel}
          </Text>
        </Pressable>
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
    marginTop: spacing.xl,
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
