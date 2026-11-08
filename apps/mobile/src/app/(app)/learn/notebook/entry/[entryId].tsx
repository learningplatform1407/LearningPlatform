import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { NotebookEntryEditor } from "@/lib/notebook-entry-editor";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";
import { useI18n } from "@/lib/i18n";

// entryId is either a real notebook entry id (editing) or one of these
// sentinels (creating) — same idiom as the "uncategorized" sentinel already
// used for Library's bookId/chapterId params, so no separate "new note"
// route files are needed.
const NEW_TEXT_SENTINEL = "new-text";
const NEW_DRAWING_SENTINEL = "new-drawing";

export default function NotebookEntryScreen() {
  const { t } = useI18n();
  const styles = useStyles();
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
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (!isNew && !entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{t("notebook.notFound")}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* As on the web notebook at phone width: back to the list, then the
          page header, then the note itself. */}
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.back}>{t("notebook.allNotes")}</Text>
      </Pressable>
      <ScreenHeader kicker={t("nav.learn")} title={t("notebook.title")} />

      <NotebookEntryEditor
        entry={entry}
        type={isNewDrawing ? "drawing" : "text"}
        onCreated={() => router.back()}
        onDeleted={() => router.back()}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  back: {
    fontSize: 14.5,
    fontWeight: fontWeights.bold,
    color: colors.accent,
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
