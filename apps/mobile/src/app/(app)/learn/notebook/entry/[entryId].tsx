import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { NotebookEntryEditor } from "@/lib/notebook-entry-editor";
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

  const entriesQuery = useQuery({
    queryKey: ["notebook-entries"],
    queryFn: () => getApiClient().listNotebookEntries(),
  });
  const entry = entriesQuery.data?.find((e) => e.id === entryId);

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
      <Text style={styles.title}>
        {isNew ? "New note" : (entry?.type ?? "text") === "text" ? "Note" : "Drawing"}
      </Text>

      <NotebookEntryEditor
        entry={entry}
        type={isNewDrawing ? "drawing" : "text"}
        onCreated={() => router.back()}
        onDeleted={() => router.back()}
      />
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
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
});
