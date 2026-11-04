"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import type { FlashcardSummaryResponse } from "@lp/contracts";

import { ExpandableRow } from "@/components/expandable-row";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/chip";
import { PageMain } from "@/components/page-main";
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
      <Tag active={dueCount > 0}>{dueCount} due</Tag>
      <Tag>{newCount} new</Tag>
    </span>
  );
}

function LessonRow({ lesson }: { lesson: SummaryLesson }) {
  return (
    <li>
      <Link
        href={`/learn/${lesson.id}?tab=flashcards`}
        className="-mx-sm flex items-center justify-between gap-sm rounded-sm px-sm py-1.5 text-toc font-semibold hover:bg-muted"
      >
        <span className="text-foreground">{lesson.title}</span>
        <CountBadges dueCount={lesson.due_count} newCount={lesson.new_count} />
      </Link>
    </li>
  );
}

function SubChapterRow({ subChapter }: { subChapter: SummarySubChapter }) {
  return (
    <ExpandableRow
      title={subChapter.title}
      badge={<CountBadges dueCount={subChapter.due_count} newCount={subChapter.new_count} />}
    >
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

function ChapterRow({ chapter }: { chapter: SummaryChapter }) {
  return (
    <ExpandableRow
      title={chapter.title}
      badge={<CountBadges dueCount={chapter.due_count} newCount={chapter.new_count} />}
    >
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

function BookRow({ book }: { book: SummaryBook }) {
  return (
    <ExpandableRow
      title={book.title}
      badge={<CountBadges dueCount={book.due_count} newCount={book.new_count} />}
    >
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

export default function FlashcardsPage() {
  const api = getBrowserApiClient();
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
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageMain>
    );
  }

  if (isError) {
    return (
      <PageMain width="reading">
        <p role="alert" className="text-sm text-danger">
          Failed to load your flashcard summary.
        </p>
      </PageMain>
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
    <PageMain width="reading">
      <PageHeader kicker="Learn" title="Flashcards" />
      <p className="text-toc text-muted-foreground">
        {totalDue} {totalDue === 1 ? "card" : "cards"} due today · {totalNew} not studied yet.
      </p>

      {data.books.length === 0 && data.uncategorized_lessons.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No lessons yet.</p>
      ) : (
        <ul className="mt-lg border-y border-border">
          {data.books.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
          {data.uncategorized_lessons.length > 0 && (
            <ExpandableRow
              title="Uncategorized"
              badge={<CountBadges dueCount={uncategorizedDue} newCount={uncategorizedNew} />}
            >
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
