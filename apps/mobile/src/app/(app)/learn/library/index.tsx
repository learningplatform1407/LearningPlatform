import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

interface BookRow {
  id: string;
  title: string;
  count: number;
  countLabel: string;
}

export default function LibraryScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const books = useQuery({
    queryKey: ["books"],
    queryFn: () => getApiClient().listBooks(),
  });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getApiClient().listDocuments("none"),
  });

  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createBookMutation = useMutation({
    mutationFn: () => getApiClient().createBook({ title }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create book.");
    },
  });

  if (me.isPending || books.isPending || uncategorized.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (books.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load the library: {(books.error as Error).message}</Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const uncategorizedLessons = uncategorized.data ?? [];
  const hasUncategorized = uncategorizedLessons.length > 0;
  const bookRows: BookRow[] = books.data.map((book) => ({
    id: book.id,
    title: book.title,
    count: book.chapter_count,
    countLabel: book.chapter_count === 1 ? "chapter" : "chapters",
  }));
  const uncategorizedRow: BookRow = {
    id: "uncategorized",
    title: "Uncategorized",
    count: uncategorizedLessons.length,
    countLabel: uncategorizedLessons.length === 1 ? "lesson" : "lessons",
  };
  const rows: BookRow[] = hasUncategorized ? [...bookRows, uncategorizedRow] : bookRows;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={(book) => book.id}
      ListHeaderComponent={
        <>
          <Pressable onPress={() => router.push("/learn")} accessibilityRole="button">
            <Text style={styles.backLink}>← Learn</Text>
          </Pressable>
          <Text style={styles.title}>Library</Text>
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>No books yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/learn/library/${item.id}`)}
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
            <Text style={styles.uploadHeading}>New book</Text>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />

            {createError && <Text style={styles.error}>{createError}</Text>}

            <Pressable
              style={[styles.button, styles.uploadButton]}
              onPress={() => createBookMutation.mutate()}
              disabled={createBookMutation.isPending || !title}
              accessibilityRole="button"
            >
              {createBookMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.uploadButtonText}>Create book</Text>
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
