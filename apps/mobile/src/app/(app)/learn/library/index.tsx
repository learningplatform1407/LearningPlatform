import { coverColorForTitle } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, shadows, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

interface BookRow {
  id: string;
  title: string;
  /** "3 chapters" / "12 lessons", in the reader's language. */
  countLabel: string;
}

export default function LibraryScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  // Half the row each, computed: with `flex: 1` a book alone on the last
  // shelf came out wider than the pair above it.
  const { width: screenWidth } = useWindowDimensions();
  const coverWidth = (screenWidth - spacing.xl * 2 - spacing.md) / 2;
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
      setCreateError(err instanceof Error ? err.message : t("library.createFailed"));
    },
  });

  if (me.isPending || books.isPending || uncategorized.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (books.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          {t("library.loadFailed", { message: (books.error as Error).message })}
        </Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const uncategorizedLessons = uncategorized.data ?? [];
  const hasUncategorized = uncategorizedLessons.length > 0;
  const bookRows: BookRow[] = books.data.map((book) => ({
    id: book.id,
    title: book.title,
    countLabel: t("library.chapters", { count: book.chapter_count }),
  }));
  const uncategorizedRow: BookRow = {
    id: "uncategorized",
    title: t("library.uncategorized"),
    countLabel: t("library.lessons", { count: uncategorizedLessons.length }),
  };
  const rows: BookRow[] = hasUncategorized ? [...bookRows, uncategorizedRow] : bookRows;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={(book) => book.id}
      // Two covers to a shelf, as on the web's narrowest grid.
      numColumns={2}
      columnWrapperStyle={styles.shelf}
      ListHeaderComponent={<ScreenHeader kicker={t("nav.learn")} title={t("library.title")} />}
      ListEmptyComponent={<Text style={styles.empty}>{t("library.empty")}</Text>}
      renderItem={({ item }) => {
        const uncategorizedBook = item.id === "uncategorized";
        return (
          <Pressable
            style={({ pressed }) => [
              styles.book,
              { width: coverWidth },
              pressed && styles.bookPressed,
            ]}
            onPress={() => router.push(`/learn/library/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.countLabel}`}
          >
            <View
              style={[
                styles.cover,
                uncategorizedBook
                  ? styles.coverPlain
                  : { backgroundColor: coverColorForTitle(item.title) },
              ]}
            >
              {/* The spine: a darker strip down the left edge. */}
              <View style={[styles.spine, uncategorizedBook && styles.spinePlain]} />
              <Text style={[styles.count, uncategorizedBook && styles.countPlain]}>
                {item.countLabel}
              </Text>
              <Text
                style={[styles.bookTitle, uncategorizedBook && styles.bookTitlePlain]}
                numberOfLines={5}
              >
                {item.title}
              </Text>
            </View>
          </Pressable>
        );
      }}
      ListFooterComponent={
        isAdmin ? (
          <View style={styles.uploadForm}>
            <Text style={styles.uploadHeading}>{t("library.newBook")}</Text>
            <Text style={styles.label}>{t("library.bookTitle")}</Text>
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
                <Text style={styles.uploadButtonText}>{t("library.createBook")}</Text>
              )}
            </Pressable>
          </View>
        ) : undefined
      }
    />
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  shelf: {
    gap: spacing.md,
  },
  book: {
    borderRadius: 12,
    backgroundColor: colors.paper,
    ...shadows.card,
  },
  bookPressed: {
    opacity: 0.85,
  },
  cover: {
    aspectRatio: 2 / 3,
    borderRadius: 12,
    overflow: "hidden",
    padding: spacing.md,
    paddingLeft: spacing.md + 6,
    justifyContent: "space-between",
  },
  coverPlain: {
    backgroundColor: colors.muted,
  },
  spine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 8,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  spinePlain: {
    backgroundColor: colors.border,
  },
  count: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    color: "#FFFFFF",
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  countPlain: {
    backgroundColor: colors.background,
    color: colors.mutedForeground,
  },
  bookTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeights.extrabold,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bookTitlePlain: {
    color: colors.mutedForeground,
    textShadowColor: "transparent",
  },
  empty: {
    fontSize: fontSizes.sm,
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
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  uploadButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: 10,
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
}));
