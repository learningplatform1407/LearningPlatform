"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import { sumBankStatsCounts } from "@lp/api-client";

import { BankStatsLine } from "@/components/bank-stats-line";
import { ExpandableRow } from "@/components/expandable-row";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { QuestionBankList } from "@/components/question-bank-list";
import { SegmentedSwitch } from "@/components/segmented-switch";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

function ProgressBadge({ answered, total }: { answered: number; total: number }) {
  const { t } = useI18n();
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">{t("bank.noQuestions")}</span>;
  }
  return (
    <span
      className={`shrink-0 text-caption font-bold tabular-nums ${answered === total ? "text-good" : "text-muted-foreground"}`}
      aria-label={t("bank.answeredOf", { answered, total })}
    >
      {answered}/{total}
    </span>
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
  if (lessons.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("bank.noLessons")}</p>;
  }
  return (
    <ul>
      {lessons.map((lesson) => (
        <LessonRow key={lesson.id} lesson={lesson} />
      ))}
    </ul>
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
  return (
    <ExpandableRow
      title={chapter.title}
      badge={<ProgressBadge answered={chapter.answered_count} total={chapter.question_count} />}
    >
      <BankStatsLine counts={chapter} />
      {chapter.sub_chapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("bank.noSubChapters")}</p>
      ) : (
        <ul>
          {chapter.sub_chapters.map((subChapter) => (
            <SubChapterRow key={subChapter.id} subChapter={subChapter} />
          ))}
        </ul>
      )}
    </ExpandableRow>
  );
}

const VIEWS = ["all", "favourites"] as const;

export default function QuestionBankPage() {
  const { t } = useI18n();
  const [view, setView] = useState<(typeof VIEWS)[number]>("all");
  const api = getBrowserApiClient();
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => api.getQuestionBankTree(),
  });

  const isEmpty =
    tree.data !== undefined &&
    tree.data.books.length === 0 &&
    tree.data.uncategorized_lessons.length === 0 &&
    tree.data.unassigned_question_count === 0;

  const unassignedCounts = tree.data && {
    question_count: tree.data.unassigned_question_count,
    answered_count: tree.data.unassigned_answered_count,
    correct_count: tree.data.unassigned_correct_count,
    partial_count: tree.data.unassigned_partial_count,
    incorrect_count: tree.data.unassigned_incorrect_count,
    points_awarded: tree.data.unassigned_points_awarded,
    points_possible: tree.data.unassigned_points_possible,
  };
  const overall =
    tree.data &&
    unassignedCounts &&
    sumBankStatsCounts([...tree.data.books, ...tree.data.uncategorized_lessons, unassignedCounts]);

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("nav.learn")} title={t("bank.title")} />
      <p className="text-toc text-muted-foreground">{t("bank.intro")}</p>

      <SegmentedSwitch
        label={t("bank.whichQuestions")}
        options={VIEWS.map((value) => ({
          value,
          label: value === "all" ? t("bank.all") : t("bank.favourites"),
        }))}
        value={view}
        onChange={setView}
        className="mt-md"
      />

      {view === "favourites" ? (
        <div className="mt-lg">
          <QuestionBankList favourites emptyMessage={t("bank.noFavourites")} />
        </div>
      ) : (
        <>
          {tree.isPending && (
            <p className="mt-lg text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {tree.isError && (
            <p role="alert" className="mt-lg text-sm text-danger">
              {t("bank.loadFailed")}
            </p>
          )}

          {tree.data && overall && (
            <div className="mt-lg w-full border-t border-border pt-md">
              <h2 className="label-caps">{t("bank.overall")}</h2>
              <p className="mt-xs text-toc font-semibold text-muted-foreground">
                {overall.answered_count}/{overall.question_count} answered
              </p>
              <BankStatsLine counts={overall} />
            </div>
          )}

          {tree.data && (
            <div className="mt-lg">
              {isEmpty ? (
                <p className="text-sm text-muted-foreground">{t("bank.empty")}</p>
              ) : (
                <ul className="border-y border-border">
                  {tree.data.books.map((book) => (
                    <ExpandableRow
                      key={book.id}
                      title={book.title}
                      badge={
                        <ProgressBadge answered={book.answered_count} total={book.question_count} />
                      }
                    >
                      <BankStatsLine counts={book} />
                      {book.chapters.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("bank.noChapters")}</p>
                      ) : (
                        <ul>
                          {book.chapters.map((chapter) => (
                            <ChapterRow key={chapter.id} chapter={chapter} />
                          ))}
                        </ul>
                      )}
                    </ExpandableRow>
                  ))}

                  {tree.data.uncategorized_lessons.length > 0 && (
                    <ExpandableRow
                      title={t("bank.uncategorizedLessons")}
                      badge={
                        <ProgressBadge
                          answered={tree.data.uncategorized_lessons.reduce(
                            (sum, lesson) => sum + lesson.answered_count,
                            0,
                          )}
                          total={tree.data.uncategorized_lessons.reduce(
                            (sum, lesson) => sum + lesson.question_count,
                            0,
                          )}
                        />
                      }
                    >
                      <BankStatsLine counts={sumBankStatsCounts(tree.data.uncategorized_lessons)} />
                      <LessonList lessons={tree.data.uncategorized_lessons} />
                    </ExpandableRow>
                  )}

                  {/* Questions whose document_id is null belong to no lesson, so
                  they hang under no node above — without this row they would
                  be unreachable from the bank entirely. */}
                  {tree.data.unassigned_question_count > 0 && unassignedCounts && (
                    <ExpandableRow
                      title={t("bank.unassigned")}
                      badge={
                        <ProgressBadge
                          answered={tree.data.unassigned_answered_count}
                          total={tree.data.unassigned_question_count}
                        />
                      }
                    >
                      <BankStatsLine counts={unassignedCounts} />
                      <QuestionBankList unassigned emptyMessage={t("bank.nothingHere")} />
                    </ExpandableRow>
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </PageMain>
  );
}
