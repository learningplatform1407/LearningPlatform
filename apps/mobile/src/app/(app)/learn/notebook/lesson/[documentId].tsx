import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { NotesTab } from "../../[id]";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

export default function NotebookLessonScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: string }>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.backLink}>← Notebook</Text>
      </Pressable>
      <Text style={styles.title}>Note</Text>
      <NotesTab documentId={documentId} />
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
});
