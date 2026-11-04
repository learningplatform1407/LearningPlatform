import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { sumBankStatsCounts } from "@lp/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { BankStatsLine } from "@/lib/bank-stats-line";
import { ExpandableRow } from "@/lib/expandable-row";
import { QuestionBankList } from "@/lib/question-bank-list";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader, SegmentedSwitch } from "@/lib/ui/primitives";

function ProgressBadge({ answered, total }: { answered: number; total: number }) {
  const styles = useStyles();
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
      <BankStatsLine counts={lesson} />
      <QuestionBankList
        filter={{ documentIds: [lesson.id] }}
        emptyMessage="No questions for this lesson yet."
      />
    </ExpandableRow>
  );
}

function LessonList({ lessons }: { lessons: BankTreeLesson[] }) {
  const styles = useStyles();
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
      <BankStatsLine counts={subChapter} />
      <LessonList lessons={subChapter.lessons} />
    </ExpandableRow>
  );
}

function ChapterRow({ chapter }: { chapter: BankTreeChapter }) {
  const styles = useStyles();
  return (
    <ExpandableRow
      title={chapter.title}
      badge={<ProgressBadge answered={chapter.answered_count} total={chapter.question_count} />}
    >
      <BankStatsLine counts={chapter} />
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

const VIEWS = [
  { value: "all", label: "All questions" },
  { value: "favourites", label: "Favourites" },
] as const;

export default function QuestionBankScreen() {
  const [view, setView] = useState<(typeof VIEWS)[number]["value"]>("all");
  const styles = useStyles();
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
  const unassignedCounts = {
    question_count: data.unassigned_question_count,
    answered_count: data.unassigned_answered_count,
    correct_count: data.unassigned_correct_count,
    partial_count: data.unassigned_partial_count,
    incorrect_count: data.unassigned_incorrect_count,
    points_awarded: data.unassigned_points_awarded,
    points_possible: data.unassigned_points_possible,
  };
  const overall = sumBankStatsCounts([
    ...data.books,
    ...data.uncategorized_lessons,
    unassignedCounts,
  ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader kicker="Learn" title="Question Bank" />
      <Text style={styles.hint}>
        The same structure as your lessons, one level deeper. Answer anything to check yourself —
        attempts are recorded, and you can retry.
      </Text>

      <SegmentedSwitch label="Which questions" options={VIEWS} value={view} onChange={setView} />

      {view === "favourites" ? (
        <QuestionBankList
          favourites
          emptyMessage="No favourites yet. Tap ♡ on any question to keep it here."
        />
      ) : (
        <>
          {!isEmpty && (
            <View style={styles.overviewCard}>
              <Text style={styles.overviewTitle}>Overall</Text>
              <Text style={styles.hint}>
                {overall.answered_count}/{overall.question_count} answered
              </Text>
              <BankStatsLine counts={overall} />
            </View>
          )}

          {isEmpty ? (
            <Text style={styles.hint}>The question bank is empty.</Text>
          ) : (
            <View style={styles.list}>
              {data.books.map((book) => (
                <ExpandableRow
                  key={book.id}
                  title={book.title}
                  badge={
                    <ProgressBadge answered={book.answered_count} total={book.question_count} />
                  }
                >
                  <BankStatsLine counts={book} />
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
                  badge={
                    <ProgressBadge answered={uncategorizedAnswered} total={uncategorizedTotal} />
                  }
                >
                  <BankStatsLine counts={sumBankStatsCounts(data.uncategorized_lessons)} />
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
                  <BankStatsLine counts={unassignedCounts} />
                  <QuestionBankList unassigned emptyMessage="Nothing here." />
                </ExpandableRow>
              )}
            </View>
          )}
        </>
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
  overviewCard: {
    borderWidth: 0,
    borderRadius: 0,
    padding: spacing.md,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 0,
  },
  overviewTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
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
}));
