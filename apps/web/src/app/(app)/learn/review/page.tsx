"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import type {
  ReviewSummaryBook,
  ReviewSummaryChapter,
  ReviewSummaryLesson,
  ReviewSummarySubChapter,
} from "@lp/contracts";

import { getBrowserApiClient } from "@/lib/api-client.browser";

function DueBadge({ count }: { count: number }) {
  return (
    <span
      className={`shrink-0 rounded-full px-sm py-0.5 text-xs font-medium ${
        count > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      }`}
    >
      {count} due
    </span>
  );
}

function LessonRow({ lesson }: { lesson: ReviewSummaryLesson }) {
  return (
    <li>
      <Link
        href={`/learn/${lesson.id}?tab=review`}
        className="flex items-center justify-between gap-sm rounded-md px-md py-xs text-sm hover:bg-muted"
      >
        <span className="text-foreground">{lesson.title}</span>
        <DueBadge count={lesson.due_count} />
      </Link>
    </li>
  );
}

// Same accordion interaction as the Library page's chapter/sub-chapter rows
// (ChapterRow/SubChapterRow in learn/library/[bookId]/page.tsx) — a
// button row with aria-expanded and a ▲/▼ indicator — but the whole tree
// is already in memory here (one eager fetch, due-counts require walking
// every lesson anyway), so expanding never triggers another request.
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
    <li className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-sm px-md py-sm text-left hover:bg-muted"
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="flex items-center gap-sm">
          <DueBadge count={dueCount} />
          <span className="text-xs text-muted-foreground">{expanded ? "▲" : "▼"}</span>
        </span>
      </button>
      {expanded && <div className="border-t border-border px-md py-md">{children}</div>}
    </li>
  );
}

function SubChapterRow({ subChapter }: { subChapter: ReviewSummarySubChapter }) {
  return (
    <ExpandableRow title={subChapter.title} dueCount={subChapter.due_count}>
      {subChapter.lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lessons.</p>
      ) : (
        <ul className="flex flex-col gap-xs">
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
    <ExpandableRow title={chapter.title} dueCount={chapter.due_count}>
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

function BookRow({ book }: { book: ReviewSummaryBook }) {
  return (
    <ExpandableRow title={book.title} dueCount={book.due_count}>
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
  );
}

export default function ReviewSummaryPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["review-summary"],
    queryFn: () => getBrowserApiClient().getReviewSummary(),
  });

  if (isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load your review summary.
        </p>
      </main>
    );
  }

  const uncategorizedDue = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.due_count,
    0,
  );
  const totalDue = data.books.reduce((sum, book) => sum + book.due_count, 0) + uncategorizedDue;

  return (
    <main className="p-xl">
      <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
        ← Learn
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Review</h1>
      <p className="mt-xs text-sm text-muted-foreground">
        {totalDue} {totalDue === 1 ? "word" : "words"} due today across your course.
      </p>

      {data.books.length === 0 && data.uncategorized_lessons.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No lessons yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {data.books.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
          {data.uncategorized_lessons.length > 0 && (
            <ExpandableRow title="Uncategorized" dueCount={uncategorizedDue}>
              <ul className="flex flex-col gap-xs">
                {data.uncategorized_lessons.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} />
                ))}
              </ul>
            </ExpandableRow>
          )}
        </ul>
      )}
    </main>
  );
}
