"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import type {
  ReviewSummaryBook,
  ReviewSummaryChapter,
  ReviewSummaryLesson,
  ReviewSummarySubChapter,
} from "@lp/contracts";

import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/chip";
import { ExpandableRow } from "@/components/expandable-row";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";

function DueBadge({ count }: { count: number }) {
  return <Tag active={count > 0}>{count} due</Tag>;
}

function LessonRow({ lesson }: { lesson: ReviewSummaryLesson }) {
  return (
    <li>
      <Link
        href={`/learn/${lesson.id}?tab=review`}
        className="-mx-sm flex items-center justify-between gap-sm rounded-sm px-sm py-1.5 text-toc font-semibold hover:bg-muted"
      >
        <span className="text-foreground">{lesson.title}</span>
        <DueBadge count={lesson.due_count} />
      </Link>
    </li>
  );
}

function SubChapterRow({ subChapter }: { subChapter: ReviewSummarySubChapter }) {
  return (
    <ExpandableRow title={subChapter.title} badge={<DueBadge count={subChapter.due_count} />}>
      {subChapter.lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lessons.</p>
      ) : (
        <ul>
          {subChapter.lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
        </ul>
      )}
    </ExpandableRow>
  );
}

function ChapterRow({ chapter }: { chapter: ReviewSummaryChapter }) {
  return (
    <ExpandableRow title={chapter.title} badge={<DueBadge count={chapter.due_count} />}>
      {chapter.sub_chapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sub-chapters.</p>
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

function BookRow({ book }: { book: ReviewSummaryBook }) {
  return (
    <ExpandableRow title={book.title} badge={<DueBadge count={book.due_count} />}>
      {book.chapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chapters.</p>
      ) : (
        <ul>
          {book.chapters.map((chapter) => (
            <ChapterRow key={chapter.id} chapter={chapter} />
          ))}
        </ul>
      )}
    </ExpandableRow>
  );
}

export default function ReviewSummaryPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["review-summary"],
    queryFn: () => getBrowserApiClient().getReviewSummary(),
  });

  if (isPending) {
    return (
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageMain>
    );
  }

  if (isError) {
    return (
      <PageMain width="reading">
        <p role="alert" className="text-sm text-danger">
          Failed to load your review summary.
        </p>
      </PageMain>
    );
  }

  const uncategorizedDue = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.due_count,
    0,
  );
  const totalDue = data.books.reduce((sum, book) => sum + book.due_count, 0) + uncategorizedDue;

  return (
    <PageMain width="reading">
      <PageHeader kicker="Learn" title="Review" />
      <p className="text-toc text-muted-foreground">
        {totalDue} {totalDue === 1 ? "word" : "words"} due today across your course.
      </p>

      {data.books.length === 0 && data.uncategorized_lessons.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No lessons yet.</p>
      ) : (
        <ul className="mt-lg border-y border-border">
          {data.books.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
          {data.uncategorized_lessons.length > 0 && (
            <ExpandableRow title="Uncategorized" badge={<DueBadge count={uncategorizedDue} />}>
              <ul>
                {data.uncategorized_lessons.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} />
                ))}
              </ul>
            </ExpandableRow>
          )}
        </ul>
      )}
    </PageMain>
  );
}
