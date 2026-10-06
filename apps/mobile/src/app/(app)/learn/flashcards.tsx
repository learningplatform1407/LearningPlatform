import type { FlashcardSummaryResponse } from "@lp/contracts";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

// Derived from the response type rather than exporting four more schemas
// from @lp/validation — the tree only ever arrives as part of the whole.
// Mirrors apps/web/src/app/(app)/learn/flashcards/page.tsx.
type SummaryBook = FlashcardSummaryResponse["books"][number];
type SummaryChapter = SummaryBook["chapters"][number];
type SummarySubChapter = SummaryChapter["sub_chapters"][number];
type SummaryLesson = SummarySubChapter["lessons"][number];

/** Due and new are reported separately, never summed: a card nobody has
 * opened yet is not overdue, and conflating them would make a freshly
 * imported deck look like a backlog. */
function CountBadges({ dueCount, newCount }: { dueCount: number; newCount: number }) {
  return (
    <View style={styles.badges}>
      <View style={[styles.badge, dueCount > 0 && styles.badgeActive]}>
        <Text style={[styles.badgeText, dueCount > 0 && styles.badgeTextActive]}>
          {dueCount} due
        </Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{newCount} new</Text>
      </View>
    </View>
  );
}

function LessonRow({ lesson }: { lesson: SummaryLesson }) {
  return (
    <Pressable
      style={styles.lessonRow}
      onPress={() => router.push(`/learn/${lesson.id}?tab=flashcards`)}
      accessibilityRole="button"
    >
      <Text style={styles.rowTitle}>{lesson.title}</Text>
      <CountBadges dueCount={lesson.due_count} newCount={lesson.new_count} />
    </Pressable>
  );
}

// Same accordion as the Review screen: the whole tree arrives in one eager
// fetch (the counts require walking every lesson anyway), so expanding
// never triggers another request, and several nodes may stay open at once.
function ExpandableRow({
  title,
  dueCount,
  newCount,
  children,
}: {
  title: string;
  dueCount: number;
  newCount: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.expandableCard}>
      <Pressable
        style={styles.expandableHeader}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.rowTitle}>{title}</Text>
        <View style={styles.expandableHeaderRight}>
          <CountBadges dueCount={dueCount} newCount={newCount} />
          <Text style={styles.expandArrow}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </Pressable>
      {expanded && <View style={styles.expandableBody}>{children}</View>}
    </View>
  );
}

function SubChapterRow({ subChapter }: { subChapter: SummarySubChapter }) {
  return (
    <ExpandableRow
      title={subChapter.title}
      dueCount={subChapter.due_count}
      newCount={subChapter.new_count}
    >
      {subChapter.lessons.length === 0 ? (
        <Text style={styles.hint}>No lessons.</Text>
      ) : (
        <View style={styles.list}>
          {subChapter.lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
        </View>
      )}
    </ExpandableRow>
  );
}

function ChapterRow({ chapter }: { chapter: SummaryChapter }) {
  return (
    <ExpandableRow title={chapter.title} dueCount={chapter.due_count} newCount={chapter.new_count}>
      {chapter.sub_chapters.length === 0 ? (
        <Text style={styles.hint}>No sub-chapters.</Text>
      ) : (
        <View style={styles.list}>
          {chapter.sub_chapters.map((subChapter) => (
            <SubChapterRow key={subChapter.id} subChapter={subChapter} />
          ))}
        </View>
      )}
    </ExpandableRow>
  );
}

function BookRow({ book }: { book: SummaryBook }) {
  return (
    <ExpandableRow title={book.title} dueCount={book.due_count} newCount={book.new_count}>
      {book.chapters.length === 0 ? (
        <Text style={styles.hint}>No chapters.</Text>
      ) : (
        <View style={styles.list}>
          {book.chapters.map((chapter) => (
            <ChapterRow key={chapter.id} chapter={chapter} />
          ))}
        </View>
      )}
    </ExpandableRow>
  );
}

export default function FlashcardsScreen() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["flashcard-summary"],
    queryFn: () => getApiClient().getFlashcardSummary(),
  });

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>Loading...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load your flashcard summary.</Text>
      </View>
    );
  }

  const uncategorizedDue = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.due_count,
    0,
  );
  const uncategorizedNew = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.new_count,
    0,
  );
  const totalDue = data.books.reduce((sum, book) => sum + book.due_count, 0) + uncategorizedDue;
  const totalNew = data.books.reduce((sum, book) => sum + book.new_count, 0) + uncategorizedNew;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/learn")} accessibilityRole="button">
        <Text style={styles.backLink}>← Learn</Text>
      </Pressable>
      <Text style={styles.title}>Flashcards</Text>
      <Text style={styles.hint}>
        {totalDue} {totalDue === 1 ? "card" : "cards"} due today · {totalNew} not studied yet.
      </Text>

      {data.books.length === 0 && data.uncategorized_lessons.length === 0 ? (
        <Text style={styles.hint}>No lessons yet.</Text>
      ) : (
        <View style={styles.list}>
          {data.books.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
          {data.uncategorized_lessons.length > 0 && (
            <ExpandableRow
              title="Uncategorized"
              dueCount={uncategorizedDue}
              newCount={uncategorizedNew}
            >
              <View style={styles.list}>
                {data.uncategorized_lessons.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} />
                ))}
              </View>
            </ExpandableRow>
          )}
        </View>
      )}
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
  list: {
    gap: spacing.xs,
  },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  expandableCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  expandableHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  expandableHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  expandArrow: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  expandableBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.muted,
  },
  badgeActive: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
  },
  badgeTextActive: {
    color: colors.primaryForeground,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
});
