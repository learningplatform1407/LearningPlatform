"use client";

import { useQuery } from "@tanstack/react-query";
import type { BankTreeChapter, BankTreeLesson, BankTreeSubChapter } from "@lp/api-client";
import Link from "next/link";

import { ExpandableRow } from "@/components/expandable-row";
import { QuestionBankList } from "@/components/question-bank-list";
import { getBrowserApiClient } from "@/lib/api-client.browser";

function ProgressBadge({ answered, total }: { answered: number; total: number }) {
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">no questions</span>;
  }
  return (
    <span
      className={`text-xs ${answered === total ? "text-success" : "text-muted-foreground"}`}
      aria-label={`${answered} of ${total} answered`}
    >
      {answered}/{total}
    </span>
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
    return <p className="text-sm text-muted-foreground">No lessons.</p>;
  }
  return (
    <ul className="flex flex-col gap-xs">
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
        <p className="text-sm text-muted-foreground">No sub-chapters.</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {chapter.sub_chapters.map((subChapter) => (
            <SubChapterRow key={subChapter.id} subChapter={subChapter} />
          ))}
        </ul>
      )}
    </ExpandableRow>
  );
}

export default function QuestionBankPage() {
  const api = getBrowserApiClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.getMe() });
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => api.getQuestionBankTree(),
  });

  const isEmpty =
    tree.data !== undefined &&
    tree.data.books.length === 0 &&
    tree.data.uncategorized_lessons.length === 0 &&
    tree.data.unassigned_question_count === 0;

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Question Bank</h1>
      <p className="mt-xs text-sm text-muted-foreground">
        The same structure as your lessons, one level deeper. Answer anything to check yourself —
        attempts are recorded, and you can retry.
      </p>

      {tree.isPending && <p className="mt-lg text-sm text-muted-foreground">Loading...</p>}
      {tree.isError && (
        <p role="alert" className="mt-lg text-sm text-danger">
          Failed to load the question bank.
        </p>
      )}

      {tree.data && (
        <div className="mt-lg w-full max-w-[48rem]">
          {isEmpty ? (
            <p className="text-sm text-muted-foreground">The question bank is empty.</p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {tree.data.books.map((book) => (
                <ExpandableRow
                  key={book.id}
                  title={book.title}
                  badge={
                    <ProgressBadge answered={book.answered_count} total={book.question_count} />
                  }
                >
                  {book.chapters.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No chapters.</p>
                  ) : (
                    <ul className="flex flex-col gap-xs">
                      {book.chapters.map((chapter) => (
                        <ChapterRow key={chapter.id} chapter={chapter} />
                      ))}
                    </ul>
                  )}
                </ExpandableRow>
              ))}

              {tree.data.uncategorized_lessons.length > 0 && (
                <ExpandableRow
                  title="Uncategorized lessons"
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
                  <LessonList lessons={tree.data.uncategorized_lessons} />
                </ExpandableRow>
              )}

              {/* Questions whose document_id is null belong to no lesson, so
                  they hang under no node above — without this row they would
                  be unreachable from the bank entirely. */}
              {tree.data.unassigned_question_count > 0 && (
                <ExpandableRow
                  title="Questions not linked to a lesson"
                  badge={
                    <ProgressBadge
                      answered={tree.data.unassigned_answered_count}
                      total={tree.data.unassigned_question_count}
                    />
                  }
                >
                  <QuestionBankList unassigned emptyMessage="Nothing here." />
                </ExpandableRow>
              )}
            </ul>
          )}
        </div>
      )}

      {me.data?.role === "admin" && (
        <Link
          href="/question-bank/manage"
          className="mt-lg inline-block text-sm text-primary hover:underline"
        >
          Import questions →
        </Link>
      )}
    </main>
  );
}
