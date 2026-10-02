import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { ExpandableRow } from "@/lib/expandable-row";
import { QuestionBankList } from "@/lib/question-bank-list";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

function ProgressBadge({ answered, total }: { answered: number; total: number }) {
  if (total === 0) {
    return <Text style={styles.badgeHint}>no questions</Text>;
  }
  return (
    <Text
      style={[styles.badgeHint, answered === total && styles.badgeComplete]}
      accessibilityLabel={`${answered} of ${total} answered`}
    >
      {answered}/{total}
    </Text>
  );
}

function LessonRow({ lesson }: { lesson: BankTreeLesson }) {
  return (
    <ExpandableRow
      title={lesson.title}
      badge={<ProgressBadge answered={lesson.answered_count} total={lesson.question_count} />}
    >
      <QuestionBankList
        filter={{ documentIds: [lesson.id] }}
        emptyMessage="No questions for this lesson yet."
      />
    </ExpandableRow>
  );
}

function LessonList({ lessons }: { lessons: BankTreeLesson[] }) {
  if (lessons.length === 0) {
    return <Text style={styles.hint}>No lessons.</Text>;
  }
  return (
    <View style={styles.list}>
      {lessons.map((lesson) => (
        <LessonRow key={lesson.id} lesson={lesson} />
      ))}
    </View>
  );
}

function SubChapterRow({ subChapter }: { subChapter: BankTreeSubChapter }) {
  return (
    <ExpandableRow
      title={subChapter.title}
      badge={
        <ProgressBadge answered={subChapter.answered_count} total={subChapter.question_count} />
      }
    >
      <LessonList lessons={subChapter.lessons} />
    </ExpandableRow>
  );
}

function ChapterRow({ chapter }: { chapter: BankTreeChapter }) {
  return (
    <ExpandableRow
      title={chapter.title}
      badge={<ProgressBadge answered={chapter.answered_count} total={chapter.question_count} />}
    >
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

export default function QuestionBankScreen() {
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });

  if (tree.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>Loading...</Text>
      </View>
    );
  }

  if (tree.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load the question bank.</Text>
      </View>
    );
  }

  const data = tree.data;
  const isEmpty =
    data.books.length === 0 &&
    data.uncategorized_lessons.length === 0 &&
    data.unassigned_question_count === 0;

  const uncategorizedAnswered = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.answered_count,
    0,
  );
  const uncategorizedTotal = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.question_count,
    0,
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Question Bank</Text>
      <Text style={styles.hint}>
        The same structure as your lessons, one level deeper. Answer anything to check yourself —
        attempts are recorded, and you can retry.
      </Text>

      {isEmpty ? (
        <Text style={styles.hint}>The question bank is empty.</Text>
      ) : (
        <View style={styles.list}>
          {data.books.map((book) => (
            <ExpandableRow
              key={book.id}
              title={book.title}
              badge={<ProgressBadge answered={book.answered_count} total={book.question_count} />}
            >
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
          ))}

          {data.uncategorized_lessons.length > 0 && (
            <ExpandableRow
              title="Uncategorized lessons"
              badge={<ProgressBadge answered={uncategorizedAnswered} total={uncategorizedTotal} />}
            >
              <LessonList lessons={data.uncategorized_lessons} />
            </ExpandableRow>
          )}

          {/* Questions whose document_id is null belong to no lesson, so they
              hang under no node above — without this row they'd be
              unreachable from the bank entirely. */}
          {data.unassigned_question_count > 0 && (
            <ExpandableRow
              title="Questions not linked to a lesson"
              badge={
                <ProgressBadge
                  answered={data.unassigned_answered_count}
                  total={data.unassigned_question_count}
                />
              }
            >
              <QuestionBankList unassigned emptyMessage="Nothing here." />
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
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  list: {
    gap: spacing.xs,
  },
  badgeHint: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  badgeComplete: {
    color: colors.success,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
});
