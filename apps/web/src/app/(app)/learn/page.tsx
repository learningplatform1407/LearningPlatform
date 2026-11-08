"use client";

import type { DailyQuestion } from "@lp/api-client";
import { lessonStatusLabel } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card } from "@/components/card";
import { DailyQuestionOverlay, useDailyQuestion } from "@/components/daily-question-overlay";
import { DailyQuestionCard, DailyQuestionRail } from "@/components/daily-question-panel";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";

const TOOLS = [
  { href: "/learn/library", key: "library" },
  { href: "/learn/review", key: "review" },
  { href: "/question-bank", key: "questionBank" },
  { href: "/learn/flashcards", key: "flashcards" },
  { href: "/learn/notebook", key: "notebook" },
] as const;

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
  const { t } = useI18n();
  const {
    data: recentLessons,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["recent-lessons"],
    queryFn: () => getBrowserApiClient().listRecentLessons(),
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("learn.loadRecentFailed")}
      </p>
    );
  }

  const [continueLesson, ...rest] = recentLessons;
  const recentlyOpened = rest.slice(0, 5);

  return (
    <>
      <PageHeader kicker={t("learn.kicker")} title={t("learn.title")} />

      {continueLesson && (
        <Link
          href={`/learn/${continueLesson.id}`}
          className="group mt-lg block border-t border-border pt-md"
        >
          <p className="label-caps">{t("learn.continue")}</p>
          <p className="mt-xs text-heading leading-tight font-extrabold text-foreground group-hover:underline">
            {continueLesson.title}
          </p>
          <p className="mt-xs text-toc font-bold text-accent">{t("learn.resume")}</p>
        </Link>
      )}

      {recentlyOpened.length > 0 && (
        <section className="mt-xl">
          <h2 className="label-caps">{t("learn.recentlyOpened")}</h2>
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
                    {lessonStatusLabel(t, lesson.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-xl label-caps">{t("learn.studyTools")}</h2>
      <div className="mt-sm grid grid-cols-1 gap-sm sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Card
            key={tool.href}
            as={Link}
            href={tool.href}
            interactive
            className="block px-md py-3.5"
          >
            <p className="text-card leading-snug font-extrabold text-foreground">
              {t(`learn.tools.${tool.key}`)}
            </p>
            <p className="mt-xs text-toc leading-snug text-muted-foreground">
              {t(`learn.tools.${tool.key}Description`)}
            </p>
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
  const { t } = useI18n();
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
            {t("daily.loadFailed")}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
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
