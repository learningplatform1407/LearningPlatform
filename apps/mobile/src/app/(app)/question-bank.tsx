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
import { useI18n } from "@/lib/i18n";

function ProgressBadge({ answered, total }: { answered: number; total: number }) {
  const { t } = useI18n();
  const styles = useStyles();
  if (total === 0) {
    return <Text style={styles.badgeHint}>{t("bank.noQuestions")}</Text>;
  }
  return (
    <Text
      style={[styles.badgeHint, answered === total && styles.badgeComplete]}
      accessibilityLabel={t("bank.answeredOf", { answered, total })}
    >
      {answered}/{total}
    </Text>
  );
}

function LessonRow({ lesson }: { lesson: BankTreeLesson }) {
  const { t } = useI18n();
  return (
    <ExpandableRow
      title={lesson.title}
      badge={<ProgressBadge answered={lesson.answered_count} total={lesson.question_count} />}
    >
      <BankStatsLine counts={lesson} />
      <QuestionBankList
        filter={{ documentIds: [lesson.id] }}
        emptyMessage={t("bank.noLessonQuestions")}
      />
    </ExpandableRow>
  );
}

function LessonList({ lessons }: { lessons: BankTreeLesson[] }) {
  const { t } = useI18n();
  const styles = useStyles();
  if (lessons.length === 0) {
    return <Text style={styles.hint}>{t("bank.noLessons")}</Text>;
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
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <ExpandableRow
      title={chapter.title}
      badge={<ProgressBadge answered={chapter.answered_count} total={chapter.question_count} />}
    >
      <BankStatsLine counts={chapter} />
      {chapter.sub_chapters.length === 0 ? (
        <Text style={styles.hint}>{t("bank.noSubChapters")}</Text>
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

const VIEWS = ["all", "favourites"] as const;

export default function QuestionBankScreen() {
  const { t } = useI18n();
  const [view, setView] = useState<(typeof VIEWS)[number]>("all");
  const styles = useStyles();
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });

  if (tree.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (tree.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{t("bank.loadFailed")}</Text>
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
      <ScreenHeader kicker={t("nav.learn")} title={t("bank.title")} />
      <Text style={styles.hint}>{t("bank.intro")}</Text>

      <SegmentedSwitch
        label={t("bank.whichQuestions")}
        options={VIEWS.map((value) => ({
          value,
          label: value === "all" ? t("bank.all") : t("bank.favourites"),
        }))}
        value={view}
        onChange={setView}
      />

      {view === "favourites" ? (
        <QuestionBankList favourites emptyMessage={t("bank.noFavourites")} />
      ) : (
        <>
          {!isEmpty && (
            <View style={styles.overviewCard}>
              <Text style={styles.overviewTitle}>{t("bank.overall")}</Text>
              <Text style={styles.hint}>
                {overall.answered_count}/{overall.question_count} answered
              </Text>
              <BankStatsLine counts={overall} />
            </View>
          )}

          {isEmpty ? (
            <Text style={styles.hint}>{t("bank.empty")}</Text>
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
                    <Text style={styles.hint}>{t("bank.noChapters")}</Text>
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
                  title={t("bank.uncategorizedLessons")}
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
                  title={t("bank.unassigned")}
                  badge={
                    <ProgressBadge
                      answered={data.unassigned_answered_count}
                      total={data.unassigned_question_count}
                    />
                  }
                >
                  <BankStatsLine counts={unassignedCounts} />
                  <QuestionBankList unassigned emptyMessage={t("bank.nothingHere")} />
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
