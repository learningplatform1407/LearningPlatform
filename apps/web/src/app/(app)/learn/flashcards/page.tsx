"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import type { FlashcardSummaryResponse } from "@lp/contracts";

import { getBrowserApiClient } from "@/lib/api-client.browser";

// Derived from the response type rather than exporting four more schemas
// from @lp/validation — the tree only ever arrives as part of the whole.
type SummaryBook = FlashcardSummaryResponse["books"][number];
type SummaryChapter = SummaryBook["chapters"][number];
type SummarySubChapter = SummaryChapter["sub_chapters"][number];
type SummaryLesson = SummarySubChapter["lessons"][number];

/** Due and new are reported separately, never summed: a card nobody has
 * opened yet is not overdue, and conflating them would make a freshly
 * imported deck look like a backlog. */
function CountBadges({ dueCount, newCount }: { dueCount: number; newCount: number }) {
  return (
    <span className="flex shrink-0 items-center gap-xs">
      <span
        className={`rounded-full px-sm py-0.5 text-xs font-medium ${
          dueCount > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {dueCount} due
      </span>
      <span className="rounded-full bg-muted px-sm py-0.5 text-xs font-medium text-muted-foreground">
        {newCount} new
      </span>
    </span>
  );
}

function LessonRow({ lesson }: { lesson: SummaryLesson }) {
  return (
    <li>
      <Link
        href={`/learn/${lesson.id}?tab=flashcards`}
        className="flex items-center justify-between gap-sm rounded-md px-md py-xs text-sm hover:bg-muted"
      >
        <span className="text-foreground">{lesson.title}</span>
        <CountBadges dueCount={lesson.due_count} newCount={lesson.new_count} />
      </Link>
    </li>
  );
}

// Same accordion as the Review dashboard: the whole tree arrives in one
// eager fetch (the counts require walking every lesson anyway), so
// expanding never triggers another request.
function ExpandableRow({
  title,
  dueCount,
  newCount,
  children,
}: {
  title: string;
  dueCount: number;
  newCount: number;
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
          <CountBadges dueCount={dueCount} newCount={newCount} />
          <span className="text-xs text-muted-foreground">{expanded ? "▲" : "▼"}</span>
        </span>
      </button>
      {expanded && <div className="border-t border-border px-md py-md">{children}</div>}
    </li>
  );
}

function SubChapterRow({ subChapter }: { subChapter: SummarySubChapter }) {
  return (
    <ExpandableRow
      title={subChapter.title}
      dueCount={subChapter.due_count}
      newCount={subChapter.new_count}
    >
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

function ChapterRow({ chapter }: { chapter: SummaryChapter }) {
  return (
    <ExpandableRow title={chapter.title} dueCount={chapter.due_count} newCount={chapter.new_count}>
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

function BookRow({ book }: { book: SummaryBook }) {
  return (
    <ExpandableRow title={book.title} dueCount={book.due_count} newCount={book.new_count}>
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

export default function FlashcardsPage() {
  const api = getBrowserApiClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.getMe() });
  const { data, isPending, isError } = useQuery({
    // Under the "flashcards" namespace on purpose: the lesson runner
    // invalidates that whole prefix after a grade or an exclusion, and these
    // counts are derived from exactly those writes. A sibling key like
    // ["flashcard-summary"] does *not* prefix-match, which left the hub
    // showing a stale backlog after studying.
    queryKey: ["flashcards", "summary"],
    queryFn: () => api.getFlashcardSummary(),
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
          Failed to load your flashcard summary.
        </p>
      </main>
    );
  }

  const uncategorizedDue = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.due_count,
    0,
  );
  const uncategorizedNew = data.uncategorized_lessons.reduce(
    (sum, lesson) => sum + lesson.new_count,
    0,
  );
  const totalDue = data.books.reduce((sum, book) => sum + book.due_count, 0) + uncategorizedDue;
  const totalNew = data.books.reduce((sum, book) => sum + book.new_count, 0) + uncategorizedNew;

  return (
    <main className="p-xl">
      <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
        ← Learn
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Flashcards</h1>
      <p className="mt-xs text-sm text-muted-foreground">
        {totalDue} {totalDue === 1 ? "card" : "cards"} due today · {totalNew} not studied yet.
      </p>

      {data.books.length === 0 && data.uncategorized_lessons.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No lessons yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {data.books.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
          {data.uncategorized_lessons.length > 0 && (
            <ExpandableRow
              title="Uncategorized"
              dueCount={uncategorizedDue}
              newCount={uncategorizedNew}
            >
              <ul className="flex flex-col gap-xs">
                {data.uncategorized_lessons.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} />
                ))}
              </ul>
            </ExpandableRow>
          )}
        </ul>
      )}

      {me.data?.role === "admin" && (
        <Link
          href="/learn/flashcards/manage"
          className="mt-lg inline-block text-sm text-primary hover:underline"
        >
          Import flashcards →
        </Link>
      )}
    </main>
  );
}
