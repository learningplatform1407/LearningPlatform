import type {
  ReviewSummaryBook,
  ReviewSummaryChapter,
  ReviewSummaryLesson,
  ReviewSummarySubChapter,
} from "@lp/contracts";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ExpandableRow } from "@/lib/expandable-row";
import { ScreenHeader, Tag } from "@/lib/ui/primitives";

function DueBadge({ count }: { count: number }) {
  return <Tag active={count > 0}>{count} due</Tag>;
}

function LessonRow({ lesson }: { lesson: ReviewSummaryLesson }) {
  const styles = useStyles();
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

function SubChapterRow({ subChapter }: { subChapter: ReviewSummarySubChapter }) {
  const styles = useStyles();
  return (
    <ExpandableRow title={subChapter.title} badge={<DueBadge count={subChapter.due_count} />}>
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
  const styles = useStyles();
  return (
    <ExpandableRow title={chapter.title} badge={<DueBadge count={chapter.due_count} />}>
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
  const styles = useStyles();
  return (
    <ExpandableRow title={book.title} badge={<DueBadge count={book.due_count} />}>
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
  const styles = useStyles();
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
      <ScreenHeader kicker="Learn" title="Review" />
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
            <ExpandableRow title="Uncategorized" badge={<DueBadge count={uncategorizedDue} />}>
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

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
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
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
}));
