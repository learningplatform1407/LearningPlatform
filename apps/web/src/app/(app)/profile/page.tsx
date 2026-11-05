"use client";

import { useQuery } from "@tanstack/react-query";
import { computeProfileBadges } from "@lp/api-client";
import { formatMonthYear } from "@lp/ui";
import Link from "next/link";

import { MetricBarChart } from "@/components/metric-bar-chart";
import { PageMain } from "@/components/page-main";
import { StatTile } from "@/components/stat-tile";
import { getBrowserApiClient } from "@/lib/api-client.browser";

export default function ProfilePage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  // Independent of the identity query above: the stats section is secondary
  // data that must degrade gracefully (its own loading/error state) without
  // ever blocking the already-working identity section, same posture as the
  // Library page's progress bars.
  const statsQuery = useQuery({
    queryKey: ["me-stats"],
    queryFn: () => getBrowserApiClient().getMyStats(),
  });

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="alert" className="text-sm text-danger">
          Failed to load profile: {(error as Error).message}
        </p>
      </main>
    );
  }

  const badges = statsQuery.data ? computeProfileBadges(statsQuery.data) : null;

  return (
    <PageMain width="reading">
      <div className="flex items-end justify-between pt-[30px]">
        <div className="flex items-end gap-md">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-medium text-muted-foreground">
            {data.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not worth next/image config for a 64px thumbnail
              <img src={data.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{(data.display_name ?? data.email ?? "?").slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="label-caps m-0">Profile</p>
            <h1 className="mt-1 text-[clamp(26px,4vw,34px)] leading-[1.15] font-extrabold break-words text-foreground">
              {data.display_name ?? data.email ?? "Unnamed"}
            </h1>
            <span className="text-toc font-semibold text-muted-foreground">
              Joined {formatMonthYear(data.created_at)}
            </span>
          </div>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-dot hover:bg-muted"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </Link>
      </div>

      <Link
        href="/settings/profile"
        className="mt-md inline-block w-fit rounded-md border border-border bg-background px-md py-[9px] text-ui font-bold text-foreground hover:bg-muted"
      >
        Edit Profile
      </Link>

      <section className="mt-xl">
        {statsQuery.isPending && <p className="text-sm text-muted-foreground">Loading stats...</p>}
        {statsQuery.data && (
          <div className="flex flex-col gap-lg">
            <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
              <StatTile
                emphasis
                label="Streak"
                value={
                  statsQuery.data.current_streak_days > 0
                    ? `🔥 ${statsQuery.data.current_streak_days} day streak`
                    : "No streak yet"
                }
              />
              <StatTile
                emphasis
                label="Lessons completed"
                value={`${statsQuery.data.lessons_completed} of ${statsQuery.data.lessons_eligible} lessons`}
              />
              <StatTile
                emphasis
                label="Exams completed"
                value={`${statsQuery.data.exams_completed}`}
              />
            </div>

            <div>
              <h2 className="label-caps mb-sm">Accuracy &amp; averages</h2>
              <MetricBarChart
                metrics={[
                  { label: "Exam average", percent: statsQuery.data.exam_average_score_percent },
                  {
                    label: "Question accuracy",
                    percent: statsQuery.data.question_accuracy_percent,
                  },
                ]}
              />
            </div>

            {badges && (
              <div>
                <h2 className="label-caps mb-sm">Badges</h2>
                <div className="flex flex-wrap gap-lg border-t border-border pt-md">
                  {badges.map((badge) => (
                    <div
                      key={badge.id}
                      role="group"
                      aria-label={`${badge.label}: ${badge.earned ? "earned" : "locked"}`}
                      className="flex w-20 flex-col items-center gap-xs text-center"
                    >
                      <div
                        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-2xl ${
                          badge.earned ? "border-accent bg-cloze-bg" : "border-border opacity-40"
                        }`}
                      >
                        <span aria-hidden="true">{badge.emoji}</span>
                      </div>
                      <span className="text-caption leading-tight font-bold text-foreground">
                        {badge.label}
                      </span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {badge.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </PageMain>
  );
}
