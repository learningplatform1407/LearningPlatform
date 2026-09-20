import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { NewEntryButtons, NotebookEntryList } from "@/lib/notebook-entry-editor";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

export default function NotebookScreen() {
  const entries = useQuery({
    queryKey: ["notebook-entries"],
    queryFn: () => getApiClient().listNotebookEntries(),
  });

  if (entries.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (entries.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load your notebook.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/learn")} accessibilityRole="button">
        <Text style={styles.backLink}>← Learn</Text>
      </Pressable>
      <Text style={styles.title}>Notebook</Text>

      <NotebookEntryList
        entries={entries.data}
        onSelect={(entryId) => router.push(`/learn/notebook/entry/${entryId}`)}
      />

      <NewEntryButtons
        onNewText={() => router.push("/learn/notebook/entry/new-text")}
        onNewDrawing={() => router.push("/learn/notebook/entry/new-drawing")}
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
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
});
