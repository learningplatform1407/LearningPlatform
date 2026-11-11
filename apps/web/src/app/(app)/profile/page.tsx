"use client";

import { useQuery } from "@tanstack/react-query";
import { formatMonthYear } from "@lp/ui";
import Link from "next/link";

import { PageMain } from "@/components/page-main";
import { ProfileStats } from "@/components/profile-stats";
import { UserAvatar } from "@/components/user-avatar";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

export default function ProfilePage() {
  const { t, language } = useI18n();
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
  const following = useQuery({
    queryKey: ["following"],
    queryFn: () => getBrowserApiClient().listFollowing(),
  });
  const followers = useQuery({
    queryKey: ["followers"],
    queryFn: () => getBrowserApiClient().listFollowers(),
  });

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="alert" className="text-sm text-danger">
          {t("common.failedToLoadProfile", { message: (error as Error).message })}
        </p>
      </main>
    );
  }

  return (
    <PageMain width="reading">
      <div className="flex items-end justify-between pt-[30px]">
        <div className="flex items-end gap-md">
          <UserAvatar url={data.avatar_url} name={data.display_name ?? data.email} size="lg" />
          <div className="flex min-w-0 flex-col">
            <p className="label-caps m-0">{t("profile.title")}</p>
            <h1 className="mt-1 text-[clamp(26px,4vw,34px)] leading-[1.15] font-extrabold break-words text-foreground">
              {data.display_name ?? data.email ?? t("profile.unnamed")}
            </h1>
            <span className="text-toc font-semibold text-muted-foreground">
              {t("profile.joined", { date: formatMonthYear(data.created_at, language) })}
            </span>
          </div>
        </div>
        <Link
          href="/settings"
          aria-label={t("nav.settings")}
          title={t("nav.settings")}
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

      {following.data && followers.data && (
        <p className="mt-sm flex gap-md text-toc font-semibold text-muted-foreground">
          <Link href="/profile/people?tab=followers" className="hover:text-foreground">
            {t("social.followersCount", { count: followers.data.length })}
          </Link>
          <Link href="/profile/people?tab=following" className="hover:text-foreground">
            {t("social.followingCount", { count: following.data.length })}
          </Link>
        </p>
      )}

      <div className="mt-md flex flex-wrap gap-sm">
        <Link
          href="/settings/profile"
          className="inline-block w-fit rounded-md border border-border bg-background px-md py-[9px] text-ui font-bold text-foreground hover:bg-muted"
        >
          {t("profile.editProfile")}
        </Link>
        <Link
          href="/profile/people"
          className="inline-block w-fit rounded-md border border-border bg-background px-md py-[9px] text-ui font-bold text-foreground hover:bg-muted"
        >
          {t("social.findPeople")}
        </Link>
      </div>

      <section className="mt-xl">
        {statsQuery.isPending && (
          <p className="text-sm text-muted-foreground">{t("profile.loadingStats")}</p>
        )}
        {statsQuery.data && <ProfileStats stats={statsQuery.data} />}
      </section>
    </PageMain>
  );
}
