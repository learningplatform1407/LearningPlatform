import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { NewEntryButtons, NotebookEntryList } from "@/lib/notebook-entry-editor";
import { fontSizes, spacing } from "@/lib/theme";
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader kicker="Learn" title="Notebook" />

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

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
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
