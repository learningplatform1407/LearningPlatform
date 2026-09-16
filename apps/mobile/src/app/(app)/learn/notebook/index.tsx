import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { DrawingThumbnail } from "@/lib/notebook-drawing-canvas";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

function firstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.trim() || "Untitled note";
}

export default function NotebookScreen() {
  const myNotes = useQuery({
    queryKey: ["my-notes"],
    queryFn: () => getApiClient().listMyNotes(),
  });
  const entries = useQuery({
    queryKey: ["notebook-entries"],
    queryFn: () => getApiClient().listNotebookEntries(),
  });

  if (myNotes.isPending || entries.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (myNotes.isError || entries.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load your notebook.</Text>
      </View>
    );
  }

  const lessonNotes = myNotes.data;
  const notebookEntries = entries.data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/learn")} accessibilityRole="button">
        <Text style={styles.backLink}>← Learn</Text>
      </Pressable>
      <Text style={styles.title}>Notebook</Text>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Lesson notes</Text>
        {lessonNotes.length === 0 && <Text style={styles.hint}>No lesson notes yet.</Text>}
        <View style={styles.list}>
          {lessonNotes.map((note) => (
            <Pressable
              key={note.document_id}
              style={styles.row}
              onPress={() => router.push(`/learn/notebook/lesson/${note.document_id}`)}
              accessibilityRole="button"
            >
              <Text style={styles.rowTitle}>{note.document_title}</Text>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {firstLine(note.content)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>My notes</Text>
        {notebookEntries.length === 0 && <Text style={styles.hint}>No notes yet.</Text>}
        <View style={styles.list}>
          {notebookEntries.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.row}
              onPress={() => router.push(`/learn/notebook/entry/${entry.id}`)}
              accessibilityRole="button"
            >
              {entry.type === "text" ? (
                <Text style={styles.rowPreview} numberOfLines={2}>
                  {firstLine(entry.content ?? "")}
                </Text>
              ) : (
                <View style={styles.drawingRow}>
                  <Text style={styles.rowTitle}>Drawing</Text>
                  <DrawingThumbnail strokes={entry.strokes ?? []} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.newRow}>
        <Pressable
          style={styles.newButton}
          onPress={() => router.push("/learn/notebook/entry/new-text")}
          accessibilityRole="button"
        >
          <Text style={styles.newButtonText}>+ Text</Text>
        </Pressable>
        <Pressable
          style={styles.newButton}
          onPress={() => router.push("/learn/notebook/entry/new-drawing")}
          accessibilityRole="button"
        >
          <Text style={styles.newButtonText}>+ Drawing</Text>
        </Pressable>
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
    gap: spacing.lg,
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
  section: {
    gap: spacing.sm,
  },
  sectionHeading: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  rowPreview: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  drawingRow: {
    gap: spacing.xs,
  },
  newRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  newButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  newButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
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
