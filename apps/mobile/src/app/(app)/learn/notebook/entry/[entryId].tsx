import type { Stroke } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { DrawingCanvas } from "@/lib/notebook-drawing-canvas";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

// entryId is either a real notebook entry id (editing) or one of these
// sentinels (creating) — same idiom as the "uncategorized" sentinel already
// used for Library's bookId/chapterId params, so no separate "new note"
// route files are needed.
const NEW_TEXT_SENTINEL = "new-text";
const NEW_DRAWING_SENTINEL = "new-drawing";

export default function NotebookEntryScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const isNewText = entryId === NEW_TEXT_SENTINEL;
  const isNewDrawing = entryId === NEW_DRAWING_SENTINEL;
  const isNew = isNewText || isNewDrawing;
  const queryClient = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: ["notebook-entries"],
    queryFn: () => getApiClient().listNotebookEntries(),
  });
  const entry = entriesQuery.data?.find((e) => e.id === entryId);

  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [strokesDraft, setStrokesDraft] = useState<Stroke[] | null>(null);
  const [saved, setSaved] = useState(false);

  // Falls back to "text" when neither a sentinel nor a loaded entry is
  // available yet — only matters for typing the hooks below, since the
  // early returns further down prevent the editor (and its Save/Delete
  // actions) from ever rendering in that state.
  const type: "text" | "drawing" = isNewDrawing ? "drawing" : isNewText ? "text" : (entry?.type ?? "text");
  const textValue = textDraft ?? entry?.content ?? "";
  const strokesValue = strokesDraft ?? entry?.strokes ?? [];
  const canSave = type === "text" ? textValue.trim().length > 0 : strokesValue.length > 0;

  const createMutation = useMutation({
    mutationFn: () =>
      type === "text"
        ? getApiClient().createNotebookEntry({ type: "text", content: textValue })
        : getApiClient().createNotebookEntry({ type: "drawing", strokes: strokesValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      router.back();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      getApiClient().updateNotebookEntry(
        entryId,
        type === "text" ? { content: textValue } : { strokes: strokesValue },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      setSaved(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => getApiClient().deleteNotebookEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      router.back();
    },
  });

  if (!isNew && entriesQuery.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (!isNew && !entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Note not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.backLink}>← Notebook</Text>
      </Pressable>
      <Text style={styles.title}>{isNew ? "New note" : type === "text" ? "Note" : "Drawing"}</Text>

      {type === "text" ? (
        <TextInput
          style={styles.input}
          value={textValue}
          onChangeText={(text) => {
            setTextDraft(text);
            setSaved(false);
          }}
          placeholder="Write a new note..."
          multiline
        />
      ) : (
        <DrawingCanvas
          strokes={strokesValue}
          onChange={(next) => {
            setStrokesDraft(next);
            setSaved(false);
          }}
        />
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.buttonPrimary, !canSave && styles.buttonDisabled]}
          onPress={() => (isNew ? createMutation.mutate() : updateMutation.mutate())}
          disabled={!canSave || createMutation.isPending || updateMutation.isPending}
          accessibilityRole="button"
        >
          {createMutation.isPending || updateMutation.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Save</Text>
          )}
        </Pressable>
        {!isNew && (
          <Pressable
            style={styles.button}
            onPress={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            accessibilityRole="button"
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        )}
        {saved && <Text style={styles.hint}>Saved.</Text>}
      </View>
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
    gap: spacing.md,
  },
  backLink: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  input: {
    minHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonPrimaryText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
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
