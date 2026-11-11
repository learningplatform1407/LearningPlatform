"use client";

import { useQuery } from "@tanstack/react-query";
import { formatMonthYear } from "@lp/ui";
import { ApiClientError } from "@lp/api-client";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ActivityList } from "@/components/activity-list";
import { Tag } from "@/components/chip";
import { PageMain } from "@/components/page-main";
import { ProfileStats } from "@/components/profile-stats";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/user-row";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

/** Another learner's profile: who they are and the same stats block your
 * own Profile page shows. Private and unknown users are both a 404 from the
 * API, deliberately indistinguishable. */
export default function PublicProfilePage() {
  const { t, language } = useI18n();
  const { userId } = useParams<{ userId: string }>();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const profile = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getBrowserApiClient().getUserProfile(userId),
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status === 404) && count < 3,
  });
  const activity = useQuery({
    queryKey: ["user-activity", userId],
    queryFn: () => getBrowserApiClient().listUserActivity(userId),
    enabled: profile.isSuccess,
  });

  if (profile.isPending) {
    return (
      <PageMain width="reading">
        <p className="pt-[30px] text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  if (profile.isError) {
    const notFound = profile.error instanceof ApiClientError && profile.error.status === 404;
    return (
      <PageMain width="reading">
        <p role="alert" className="pt-[30px] text-sm text-muted-foreground">
          {notFound
            ? t("social.notFound")
            : t("social.loadFailed", { message: (profile.error as Error).message })}
        </p>
        <Link href="/profile/people" className="mt-sm inline-block font-bold text-accent">
          {t("social.findPeople")}
        </Link>
      </PageMain>
    );
  }

  const user = profile.data;
  const isMe = me.data?.id === user.id;
  const name = user.display_name ?? t("profile.unnamed");

  return (
    <PageMain width="reading">
      <div className="flex flex-wrap items-end justify-between gap-md pt-[30px]">
        <div className="flex min-w-0 items-end gap-md">
          <UserAvatar url={user.avatar_url} name={user.display_name} size="lg" />
          <div className="flex min-w-0 flex-col">
            <p className="label-caps m-0">{t("social.learner")}</p>
            <h1 className="mt-1 text-[clamp(26px,4vw,34px)] leading-[1.15] font-extrabold break-words text-foreground">
              {name}
            </h1>
            <span className="text-toc font-semibold text-muted-foreground">
              {[
                user.university,
                t("profile.joined", { date: formatMonthYear(user.created_at, language) }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
        {!isMe && (
          <div className="flex items-center gap-sm">
            {user.follows_you && <Tag>{t("social.followsYou")}</Tag>}
            <FollowButton user={user} />
          </div>
        )}
      </div>

      <p className="mt-sm flex gap-md text-toc font-semibold text-muted-foreground">
        <span>{t("social.followersCount", { count: user.followers_count })}</span>
        <span>{t("social.followingCount", { count: user.following_count })}</span>
      </p>

      <section className="mt-xl">
        <ProfileStats stats={user.stats} />
      </section>

      <section className="mt-xl">
        <h2 className="label-caps mb-sm">{t("social.activity.recent")}</h2>
        {activity.data &&
          (activity.data.length > 0 ? (
            <ActivityList events={activity.data} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("social.activity.emptyUser")}</p>
          ))}
      </section>
    </PageMain>
  );
}
