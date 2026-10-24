"use client";

import type { DailyQuestion } from "@lp/api-client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card } from "@/components/card";
import { DailyQuestionOverlay, useDailyQuestion } from "@/components/daily-question-overlay";
import { DailyQuestionCard, DailyQuestionRail } from "@/components/daily-question-panel";
import { getBrowserApiClient } from "@/lib/api-client.browser";

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

/** The hub's own content: recent lessons and the nav grid.
 *
 * Its query lives here rather than in the page so the loading and error
 * branches can keep their early returns while the layout -- and with it the
 * calendar rail -- stays mounted above them. Previously each branch returned
 * its own `<main className="p-xl">`, which would have made the rail vanish
 * during both, and would have delayed the question's auto-open until an
 * unrelated lessons query resolved.
 */
function LearnContent({
  today,
  onOpenToday,
}: {
  today: DailyQuestion | undefined;
  onOpenToday: () => void;
}) {
  const {
    data: recentLessons,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["recent-lessons"],
    queryFn: () => getBrowserApiClient().listRecentLessons(),
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load your recent lessons.
      </p>
    );
  }

  const [continueLesson, ...rest] = recentLessons;
  const recentlyOpened = rest.slice(0, 5);

  return (
    <>
      <h1 className="text-2xl font-bold text-foreground">Learn</h1>

      {continueLesson && (
        <Card
          as={Link}
          href={`/learn/${continueLesson.id}`}
          interactive
          className="mt-lg block bg-muted px-lg py-md"
        >
          <p className="text-xs font-medium text-muted-foreground">Continue where you left off</p>
          <p className="mt-xs text-lg font-semibold text-foreground">{continueLesson.title}</p>
        </Card>
      )}

      {recentlyOpened.length > 0 && (
        <section className="mt-lg">
          <h2 className="text-sm font-semibold text-foreground">Recently opened</h2>
          <ul className="mt-sm flex flex-col gap-xs">
            {recentlyOpened.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/learn/${lesson.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-md py-sm hover:bg-muted"
                >
                  <span className="text-sm font-medium text-foreground">{lesson.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {lesson.status ? (STATUS_LABEL[lesson.status] ?? lesson.status) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-2xl grid max-w-[80rem] grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card as={Link} href="/learn/library" interactive className="block p-lg">
          <p className="text-lg font-semibold text-foreground">Library</p>
          <p className="mt-xs text-sm text-muted-foreground">
            Browse books, chapters, and lessons.
          </p>
        </Card>
        <Card as={Link} href="/learn/review" interactive className="block p-lg">
          <p className="text-lg font-semibold text-foreground">Review</p>
          <p className="mt-xs text-sm text-muted-foreground">
            See how many words are due today, across every lesson.
          </p>
        </Card>
        <Card as={Link} href="/question-bank" interactive className="block p-lg">
          <p className="text-lg font-semibold text-foreground">Question Bank</p>
          <p className="mt-xs text-sm text-muted-foreground">
            Browse and answer questions, with stats on your progress.
          </p>
        </Card>
        <Card as={Link} href="/learn/flashcards" interactive className="block p-lg">
          <p className="text-lg font-semibold text-foreground">Flashcards</p>
          <p className="mt-xs text-sm text-muted-foreground">
            Spaced-repetition cards per lesson, official and your own.
          </p>
        </Card>
        <Card as={Link} href="/learn/notebook" interactive className="block p-lg">
          <p className="text-lg font-semibold text-foreground">Notebook</p>
          <p className="mt-xs text-sm text-muted-foreground">
            All your notes and drawings in one place.
          </p>
        </Card>
        {/* Below `lg` the rail is hidden, so the question gets a sixth card
            here instead -- which is also the shape mobile uses. */}
        {today && <DailyQuestionCard today={today} onOpen={onOpenToday} />}
      </div>
    </>
  );
}

export default function LearnPage() {
  const { today, openDate, open, holdOpen, close } = useDailyQuestion();
  const day = today.data;

  return (
    <main className="flex w-full">
      {/* min-w-0 so a long lesson title cannot push the rail off screen: a
          flex item's default min-width is auto, which is its content. */}
      <div className="min-w-0 flex-1 p-xl">
        <LearnContent
          today={day}
          onOpenToday={() => {
            if (day) open(day.server_today);
          }}
        />
      </div>

      <aside className="hidden shrink-0 border-l border-border p-lg lg:flex lg:w-[20rem]">
        {day ? (
          <DailyQuestionRail today={day} onOpenDay={open} />
        ) : today.isError ? (
          <p role="alert" className="text-xs text-danger">
            Failed to load the question of the day.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Loading...</p>
        )}
      </aside>

      {/* One overlay for both entry points, mounted here so the rail and the
          card cannot each open their own. */}
      {day && (
        <DailyQuestionOverlay
          forDate={openDate}
          today={day}
          onAnswered={holdOpen}
          onClose={close}
        />
      )}
    </main>
  );
}
