import { coverColorForTitle } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, Text, View, useWindowDimensions } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, shadows, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

interface BookRow {
  id: string;
  title: string;
  /** "3 chapters" / "12 lessons", in the reader's language. */
  countLabel: string;
}

/**
 * The shelf of books, for browsing.
 *
 * The "New book" form that used to sit at the bottom of it for an admin is
 * gone: library authoring is web-only (`/admin/library`), for the reason
 * recorded in docs/architecture/README.md -- create controls do not belong on
 * the page every learner reads. The feed composer is the one thing an admin
 * posts from the phone.
 */
export default function LibraryScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  // Half the row each, computed: with `flex: 1` a book alone on the last
  // shelf came out wider than the pair above it.
  const { width: screenWidth } = useWindowDimensions();
  const coverWidth = (screenWidth - spacing.xl * 2 - spacing.md) / 2;
  const books = useQuery({
    queryKey: ["books"],
    queryFn: () => getApiClient().listBooks(),
  });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getApiClient().listDocuments("none"),
  });

  if (books.isPending || uncategorized.isPending) {
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
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
}));
