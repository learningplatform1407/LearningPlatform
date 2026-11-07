import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { NewEntryButtons, NotebookEntryList } from "@/lib/notebook-entry-editor";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

export default function NotebookScreen() {
  const styles = useStyles();
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

  // The web notebook's phone layout: the list of notes, with the two "new"
  // buttons pinned under it.
  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ScreenHeader kicker="Learn" title="Notebook" />
        <Text style={styles.sectionLabel}>Notes</Text>
        <NotebookEntryList
          entries={entries.data}
          onSelect={(entryId) => router.push(`/learn/notebook/entry/${entryId}`)}
        />
      </ScrollView>
      <View style={styles.footer}>
        <NewEntryButtons
          onNewText={() => router.push("/learn/notebook/entry/new-text")}
          onNewDrawing={() => router.push("/learn/notebook/entry/new-drawing")}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  sectionLabel: {
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.sm,
    backgroundColor: colors.background,
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
