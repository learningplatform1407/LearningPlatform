"use client";

import type { DailyQuestion } from "@lp/api-client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card } from "@/components/card";
import { DailyQuestionOverlay, useDailyQuestion } from "@/components/daily-question-overlay";
import { DailyQuestionCard, DailyQuestionRail } from "@/components/daily-question-panel";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { PageHeader } from "@/components/page-header";

const TOOLS = [
  { href: "/learn/library", title: "Library", description: "Browse books, chapters, and lessons." },
  {
    href: "/learn/review",
    title: "Review",
    description: "See how many words are due today, across every lesson.",
  },
  {
    href: "/question-bank",
    title: "Question Bank",
    description: "Browse and answer questions, with stats on your progress.",
  },
  {
    href: "/learn/flashcards",
    title: "Flashcards",
    description: "Spaced-repetition cards per lesson, official and your own.",
  },
  {
    href: "/learn/notebook",
    title: "Notebook",
    description: "All your notes and drawings in one place.",
  },
];

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
      <PageHeader kicker="Your course" title="Learn" />

      {continueLesson && (
        <Link
          href={`/learn/${continueLesson.id}`}
          className="group mt-lg block border-t border-border pt-md"
        >
          <p className="label-caps">Continue where you left off</p>
          <p className="mt-xs text-heading leading-tight font-extrabold text-foreground group-hover:underline">
            {continueLesson.title}
          </p>
          <p className="mt-xs text-toc font-bold text-accent">Resume reading →</p>
        </Link>
      )}

      {recentlyOpened.length > 0 && (
        <section className="mt-xl">
          <h2 className="label-caps">Recently opened</h2>
          <ul className="mt-sm border-t border-border">
            {recentlyOpened.map((lesson) => (
              <li key={lesson.id} className="border-b border-border">
                <Link
                  href={`/learn/${lesson.id}`}
                  className="-mx-sm flex items-center justify-between gap-md rounded-sm px-sm py-2.5 hover:bg-muted"
                >
                  <span className="min-w-0 truncate text-ui font-semibold text-foreground">
                    {lesson.title}
                  </span>
                  <span className="shrink-0 text-caption font-semibold text-muted-foreground">
                    {lesson.status ? (STATUS_LABEL[lesson.status] ?? lesson.status) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-xl label-caps">Study tools</h2>
      <div className="mt-sm grid grid-cols-1 gap-sm sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Card
            key={tool.href}
            as={Link}
            href={tool.href}
            interactive
            className="block px-md py-3.5"
          >
            <p className="text-card leading-snug font-extrabold text-foreground">{tool.title}</p>
            <p className="mt-xs text-toc leading-snug text-muted-foreground">{tool.description}</p>
          </Card>
        ))}
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
      <div className="min-w-0 flex-1 px-md pb-3xl md:px-xl">
        <div className="mx-auto w-full max-w-[47.5rem]">
          <LearnContent
            today={day}
            onOpenToday={() => {
              if (day) open(day.server_today);
            }}
          />
        </div>
      </div>

      <aside className="hidden shrink-0 border-l border-border px-lg pt-[42px] lg:flex lg:w-[20rem]">
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
