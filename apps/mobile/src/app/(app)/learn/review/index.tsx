import type {
  ReviewSummaryBook,
  ReviewSummaryChapter,
  ReviewSummaryLesson,
  ReviewSummarySubChapter,
} from "@lp/contracts";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

function DueBadge({ count }: { count: number }) {
  return (
    <View style={[styles.dueBadge, count > 0 && styles.dueBadgeActive]}>
      <Text style={[styles.dueBadgeText, count > 0 && styles.dueBadgeTextActive]}>
        {count} due
      </Text>
    </View>
  );
}

function LessonRow({ lesson }: { lesson: ReviewSummaryLesson }) {
  return (
    <Pressable
      style={styles.lessonRow}
      onPress={() => router.push(`/learn/${lesson.id}?tab=review`)}
      accessibilityRole="button"
    >
      <Text style={styles.rowTitle}>{lesson.title}</Text>
      <DueBadge count={lesson.due_count} />
    </Pressable>
  );
}

// Same accordion interaction as the Library chapter screen's SubChapterRow
// (learn/library/[bookId]/[chapterId].tsx), but each row owns its own
// expanded state rather than sharing one "which row is open" slot -- the
// whole tree is already in memory here (one eager fetch), so there's no
// cost to letting several nodes stay open at once while comparing counts.
function ExpandableRow({
  title,
  dueCount,
  children,
}: {
  title: string;
  dueCount: number;
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
          <DueBadge count={dueCount} />
          <Text style={styles.expandArrow}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </Pressable>
      {expanded && <View style={styles.expandableBody}>{children}</View>}
    </View>
  );
}

function SubChapterRow({ subChapter }: { subChapter: ReviewSummarySubChapter }) {
  return (
    <ExpandableRow title={subChapter.title} dueCount={subChapter.due_count}>
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

function ChapterRow({ chapter }: { chapter: ReviewSummaryChapter }) {
  return (
    <ExpandableRow title={chapter.title} dueCount={chapter.due_count}>
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

function BookRow({ book }: { book: ReviewSummaryBook }) {
  return (
    <ExpandableRow title={book.title} dueCount={book.due_count}>
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

export default function ReviewSummaryScreen() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["review-summary"],
    queryFn: () => getApiClient().getReviewSummary(),
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
        <Text style={styles.error}>Failed to load your review summary.</Text>
      </View>
    );
  }

  const uncategorizedDue = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.due_count,
    0,
  );
  const totalDue = data.books.reduce((sum, book) => sum + book.due_count, 0) + uncategorizedDue;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/learn")} accessibilityRole="button">
        <Text style={styles.backLink}>← Learn</Text>
      </Pressable>
      <Text style={styles.title}>Review</Text>
      <Text style={styles.hint}>
        {totalDue} {totalDue === 1 ? "word" : "words"} due today across your course.
      </Text>

      {data.books.length === 0 && data.uncategorized_lessons.length === 0 ? (
        <Text style={styles.hint}>No lessons yet.</Text>
      ) : (
        <View style={styles.list}>
          {data.books.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
          {data.uncategorized_lessons.length > 0 && (
            <ExpandableRow title="Uncategorized" dueCount={uncategorizedDue}>
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
  dueBadge: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.muted,
  },
  dueBadgeActive: {
    backgroundColor: colors.primary,
  },
  dueBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
  },
  dueBadgeTextActive: {
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
