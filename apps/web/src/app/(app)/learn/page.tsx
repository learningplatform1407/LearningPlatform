"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { getBrowserApiClient } from "@/lib/api-client.browser";

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

export default function LearnPage() {
  const { data: recentLessons, isPending, isError } = useQuery({
    queryKey: ["recent-lessons"],
    queryFn: () => getBrowserApiClient().listRecentLessons(),
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
          Failed to load your recent lessons.
        </p>
      </main>
    );
  }

  const [continueLesson, ...rest] = recentLessons;
  const recentlyOpened = rest.slice(0, 5);

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Learn</h1>

      {continueLesson && (
        <Link
          href={`/learn/${continueLesson.id}`}
          className="mt-lg block rounded-md border border-border bg-muted px-lg py-md hover:bg-muted/70"
        >
          <p className="text-xs font-medium text-muted-foreground">Continue where you left off</p>
          <p className="mt-xs text-lg font-semibold text-foreground">{continueLesson.title}</p>
        </Link>
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

      <div className="mt-2xl max-w-[24rem]">
        <Link href="/learn/lessons" className="block rounded-md border border-border p-lg hover:bg-muted">
          <p className="text-lg font-semibold text-foreground">Lessons</p>
          <p className="mt-xs text-sm text-muted-foreground">Browse chapters and lessons.</p>
        </Link>
      </div>
    </main>
  );
}
