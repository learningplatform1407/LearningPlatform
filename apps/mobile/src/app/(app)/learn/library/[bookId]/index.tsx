import { lessonStatusLabel } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { computeLessonCompletionPercent } from "@lp/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { ProgressBar } from "@/lib/progress-bar";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";
import { useI18n } from "@/lib/i18n";

/**
 * A book's chapters, and the lessons under them: browsing only.
 *
 * The four authoring forms that used to be inline here for an admin -- new
 * chapter, new sub-chapter, upload a lesson, replace a lesson's text or PDF
 * -- are gone. Library authoring is web-only (`/admin/library`, see
 * docs/architecture/README.md): a create-and-upload form rendered in the
 * middle of the pages every learner reads is in front of people it was never
 * meant for, and the web stopped doing it first. The feed composer remains
 * the one thing an admin posts from the phone.
 */
function UncategorizedLessonsScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getApiClient().listDocuments("none"),
  });
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });
  const lessonProgress = new Map<string, BankTreeLesson>(
    tree.data?.uncategorized_lessons.map((lesson) => [lesson.id, lesson]),
  );

  if (uncategorized.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  const lessons = uncategorized.data ?? [];

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={lessons}
      keyExtractor={(doc) => doc.id}
      ListHeaderComponent={
        <ScreenHeader kicker={t("library.title")} title={t("library.uncategorized")} />
      }
      ListEmptyComponent={<Text style={styles.empty}>{t("book.noLessons")}</Text>}
      renderItem={({ item }) => (
        <View>
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/learn/${item.id}`)}
            accessibilityRole="button"
          >
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowStatus}>{lessonStatusLabel(t, item.status)}</Text>
          </Pressable>
          <ProgressBar
            percent={computeLessonCompletionPercent(
              lessonProgress.get(item.id) ?? {
                eligible_lesson_count: 0,
                completed_lesson_count: 0,
              },
            )}
          />
        </View>
      )}
    />
  );
}

function LessonList({
  subChapterId,
  lessonProgress,
}: {
  subChapterId: string;
  lessonProgress: Map<string, BankTreeLesson>;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const documents = useQuery({
    queryKey: ["documents", subChapterId],
    queryFn: () => getApiClient().listDocuments(subChapterId),
  });

  if (documents.isPending) {
    return <Text style={styles.loading}>{t("common.loading")}</Text>;
  }

  if (documents.isError) {
    return (
      <Text style={styles.error}>
        {t("book.loadLessonsFailed", { message: (documents.error as Error).message })}
      </Text>
    );
  }

  return (
    <View style={styles.lessonListContent}>
      {documents.data.length === 0 ? (
        <Text style={styles.empty}>{t("book.noLessons")}</Text>
      ) : (
        documents.data.map((item) => (
          <View key={item.id}>
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/learn/${item.id}`)}
              accessibilityRole="button"
            >
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowStatus}>{lessonStatusLabel(t, item.status)}</Text>
            </Pressable>
            <ProgressBar
              percent={computeLessonCompletionPercent(
                lessonProgress.get(item.id) ?? {
                  eligible_lesson_count: 0,
                  completed_lesson_count: 0,
                },
              )}
            />
          </View>
        ))
      )}
    </View>
  );
}

function SubChapterRow({
  subChapter,
  subChapterNode,
  isExpanded,
  onToggle,
}: {
  subChapter: { id: string; title: string; lesson_count: number };
  subChapterNode: BankTreeSubChapter | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const lessonProgress = new Map<string, BankTreeLesson>(
    subChapterNode?.lessons.map((lesson) => [lesson.id, lesson]),
  );
  return (
    <View style={styles.subChapterCard}>
      <Pressable
        style={styles.subChapterHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.rowTitle}>{subChapter.title}</Text>
        <Text style={styles.rowStatus}>
          {t("library.lessons", { count: subChapter.lesson_count })} {isExpanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {subChapterNode && (
        <View style={styles.progressWrapper}>
          <ProgressBar percent={computeLessonCompletionPercent(subChapterNode)} />
        </View>
      )}
      {isExpanded && (
        <View style={styles.subChapterBody}>
          <LessonList subChapterId={subChapter.id} lessonProgress={lessonProgress} />
        </View>
      )}
    </View>
  );
}

function ChapterRow({
  chapter,
  chapterNode,
  isExpanded,
  onToggle,
}: {
  chapter: { id: string; title: string; sub_chapter_count: number };
  chapterNode: BankTreeChapter | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const subChapterProgress = new Map<string, BankTreeSubChapter>(
    chapterNode?.sub_chapters.map((subChapter) => [subChapter.id, subChapter]),
  );
  const subChapters = useQuery({
    queryKey: ["sub-chapters", chapter.id],
    queryFn: () => getApiClient().listSubChapters(chapter.id),
    enabled: isExpanded,
  });

  const [expandedSubChapterId, setExpandedSubChapterId] = useState<string | null>(null);

  return (
    <View style={styles.chapterCard}>
      <Pressable
        style={styles.chapterHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.rowTitle}>{chapter.title}</Text>
        <Text style={styles.rowStatus}>
          {t("library.subChapters", { count: chapter.sub_chapter_count })} {isExpanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {chapterNode && (
        <View style={styles.progressWrapper}>
          <ProgressBar percent={computeLessonCompletionPercent(chapterNode)} />
        </View>
      )}
      {isExpanded && (
        <View style={styles.chapterBody}>
          {subChapters.isPending ? (
            <Text style={styles.loading}>{t("common.loading")}</Text>
          ) : subChapters.isError ? (
            <Text style={styles.error}>
              {t("book.loadSubChaptersFailed", { message: (subChapters.error as Error).message })}
            </Text>
          ) : subChapters.data.length === 0 ? (
            <Text style={styles.empty}>{t("book.noSubChapters")}</Text>
          ) : (
            <View style={styles.subChapterList}>
              {subChapters.data.map((subChapter) => (
                <SubChapterRow
                  key={subChapter.id}
                  subChapter={subChapter}
                  subChapterNode={subChapterProgress.get(subChapter.id)}
                  isExpanded={expandedSubChapterId === subChapter.id}
                  onToggle={() =>
                    setExpandedSubChapterId((current) =>
                      current === subChapter.id ? null : subChapter.id,
                    )
                  }
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function BookChaptersScreen({ bookId }: { bookId: string }) {
  const { t } = useI18n();
  const styles = useStyles();
  const chapters = useQuery({
    queryKey: ["chapters", bookId],
    queryFn: () => getApiClient().listChapters(bookId),
  });
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });
  const bookNode = tree.data?.books.find((book) => book.id === bookId);
  // The book's own name as the screen title; the library list it was opened
  // from is cached, so it's there on the first frame.
  const books = useQuery({ queryKey: ["books"], queryFn: () => getApiClient().listBooks() });
  const bookTitle = books.data?.find((book) => book.id === bookId)?.title;
  const chapterProgress = new Map<string, BankTreeChapter>(
    bookNode?.chapters.map((chapter) => [chapter.id, chapter]),
  );

  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);

  if (chapters.isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (chapters.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          {t("book.loadChaptersFailed", { message: (chapters.error as Error).message })}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={chapters.data}
      keyExtractor={(chapter) => chapter.id}
      ListHeaderComponent={
        <>
          <ScreenHeader kicker={t("book.kicker")} title={bookTitle ?? t("book.chapters")} />
          {bookNode && (
            <View style={styles.overallProgress}>
              <ProgressBar
                percent={computeLessonCompletionPercent(bookNode)}
                label={t("book.overallProgress")}
                stacked
              />
            </View>
          )}
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t("book.noChapters")}</Text>}
      renderItem={({ item }) => (
        <ChapterRow
          chapter={item}
          chapterNode={chapterProgress.get(item.id)}
          isExpanded={expandedChapterId === item.id}
          onToggle={() => setExpandedChapterId((current) => (current === item.id ? null : item.id))}
        />
      )}
    />
  );
}

export default function BookScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  if (bookId === "uncategorized") {
    return <UncategorizedLessonsScreen />;
  }
  return <BookChaptersScreen bookId={bookId} />;
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.xs,
  },
  lessonListContent: {
    gap: spacing.xs,
  },
  progressWrapper: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  overallProgress: {
    marginTop: spacing.xs,
    maxWidth: 384,
  },
  empty: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  chapterCard: {
    borderWidth: 0,
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 0,
  },
  chapterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chapterBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  subChapterList: {
    gap: spacing.xs,
  },
  subChapterCard: {
    borderWidth: 0,
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 0,
  },
  subChapterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  subChapterBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
}));
