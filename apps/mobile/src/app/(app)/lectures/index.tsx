import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
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

export default function LecturesScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: () => getApiClient().listDocuments(),
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
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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

  if (me.isPending || documents.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (documents.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load lectures: {(documents.error as Error).message}</Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={documents.data}
      keyExtractor={(doc) => doc.id}
      ListHeaderComponent={<Text style={styles.title}>Lectures</Text>}
      ListEmptyComponent={<Text style={styles.empty}>No lectures uploaded yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/lectures/${item.id}`)}
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
            <Text style={styles.uploadHeading}>Upload a lecture</Text>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.xs,
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
