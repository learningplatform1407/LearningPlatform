"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { UserSummary } from "@lp/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ActivityList } from "@/components/activity-list";
import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { SegmentedSwitch } from "@/components/segmented-switch";
import { UserRow } from "@/components/user-row";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";
import { useRemoveFollower } from "@/lib/use-follow";

type Tab = "search" | "following" | "followers" | "activity";
const TABS: readonly Tab[] = ["search", "following", "followers", "activity"];

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

export default function PeoplePage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "search",
  );

  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("profile.title")} title={t("social.peopleTitle")} />

      {me.data && !me.data.settings.profile_public && (
        <p className="mt-sm text-toc text-muted-foreground">
          {t("social.privateNotice")}{" "}
          <Link href="/settings/privacy" className="font-bold text-accent hover:underline">
            {t("social.privateNoticeLink")}
          </Link>
        </p>
      )}

      <SegmentedSwitch
        className="mt-md"
        label={t("social.peopleTitle")}
        options={TABS.map((key) => ({ value: key, label: t(`social.tabs.${key}`) }))}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-md">
        {tab === "search" && <SearchTab />}
        {tab === "following" && <FollowingTab />}
        {tab === "followers" && <FollowersTab />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </PageMain>
  );
}

function SearchTab() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim());
  const enabled = debounced.length >= MIN_QUERY_LENGTH;
  const results = useQuery({
    queryKey: ["user-search", debounced],
    queryFn: () => getBrowserApiClient().searchUsers(debounced),
    enabled,
  });

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t("social.searchLabel")}
        placeholder={t("social.searchPlaceholder")}
        maxLength={50}
        className="w-full rounded-md border border-border bg-background px-md py-[9px] text-ui text-foreground"
      />
      {!enabled && (
        <p className="mt-sm text-caption text-muted-foreground">{t("social.searchHint")}</p>
      )}
      {enabled && results.isPending && (
        <p className="mt-sm text-sm text-muted-foreground">{t("social.searching")}</p>
      )}
      {enabled && results.isError && (
        <p role="alert" className="mt-sm text-sm text-danger">
          {t("social.loadFailed", { message: (results.error as Error).message })}
        </p>
      )}
      {enabled && results.data?.length === 0 && (
        <p className="mt-sm text-sm text-muted-foreground">
          {t("social.noResults", { query: debounced })}
        </p>
      )}
      {enabled && results.data && results.data.length > 0 && <UserList users={results.data} />}
    </div>
  );
}

function FollowingTab() {
  const { t } = useI18n();
  const following = useQuery({
    queryKey: ["following"],
    queryFn: () => getBrowserApiClient().listFollowing(),
  });
  if (following.isPending)
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (following.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("social.loadFailed", { message: (following.error as Error).message })}
      </p>
    );
  }
  if (following.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("social.emptyFollowing")}</p>;
  }
  return <UserList users={following.data} />;
}

function FollowersTab() {
  const { t } = useI18n();
  const followers = useQuery({
    queryKey: ["followers"],
    queryFn: () => getBrowserApiClient().listFollowers(),
  });
  const remove = useRemoveFollower();
  if (followers.isPending)
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (followers.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("social.loadFailed", { message: (followers.error as Error).message })}
      </p>
    );
  }
  if (followers.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("social.emptyFollowers")}</p>;
  }
  return (
    <>
      {remove.isError && (
        <p role="alert" className="mb-sm text-sm text-danger">
          {t("social.actionFailed", { message: (remove.error as Error).message })}
        </p>
      )}
      <UserList users={followers.data} onRemove={(user) => remove.mutate(user.id)} />
    </>
  );
}

const ACTIVITY_PAGE_SIZE = 20;

function ActivityTab() {
  const { t } = useI18n();
  const activity = useInfiniteQuery({
    queryKey: ["activity", "all"],
    queryFn: ({ pageParam }) =>
      getBrowserApiClient().listFollowingActivity({
        before: pageParam,
        limit: ACTIVITY_PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    // A short page means there is nothing older.
    getNextPageParam: (lastPage) =>
      lastPage.length < ACTIVITY_PAGE_SIZE ? undefined : lastPage.at(-1)?.created_at,
  });
  if (activity.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (activity.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("social.loadFailed", { message: (activity.error as Error).message })}
      </p>
    );
  }
  const events = activity.data.pages.flat();
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("social.activity.empty")}</p>;
  }
  return (
    <>
      <ActivityList events={events} />
      {activity.hasNextPage && (
        <Button
          variant="secondary"
          className="mt-md"
          disabled={activity.isFetchingNextPage}
          onClick={() => activity.fetchNextPage()}
        >
          {activity.isFetchingNextPage ? t("common.loading") : t("social.activity.loadMore")}
        </Button>
      )}
    </>
  );
}

function UserList({
  users,
  onRemove,
}: {
  users: UserSummary[];
  onRemove?: (user: UserSummary) => void;
}) {
  return (
    <ul className="m-0 list-none border-b border-border p-0">
      {users.map((user) => (
        <UserRow key={user.id} user={user} onRemove={onRemove && (() => onRemove(user))} />
      ))}
    </ul>
  );
}
