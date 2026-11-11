"use client";

import { useQuery } from "@tanstack/react-query";
import { outcomeLabel } from "@lp/ui";
import Link from "next/link";

import { Tag } from "@/components/chip";
import { UserAvatar } from "@/components/user-avatar";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

/** Under today's revealed answer: how the people you follow did. Rendered
 * only after you've answered (the API refuses it before), and nothing at all
 * while none of them has. Under the ["daily-question"] key, so answering
 * refreshes it with the day. */
export function DailyFollowing() {
  const { t } = useI18n();
  const following = useQuery({
    queryKey: ["daily-question", "following"],
    queryFn: () => getBrowserApiClient().getDailyFollowing(),
  });
  const data = following.data;
  if (!data || data.answered_count === 0) return null;

  return (
    <section className="mt-md border-t border-border pt-sm">
      <div className="flex items-baseline justify-between gap-sm">
        <h3 className="label-caps m-0">{t("social.daily.title")}</h3>
        <span className="text-caption font-bold text-muted-foreground">
          {t("social.daily.summary", { correct: data.correct_count, count: data.answered_count })}
        </span>
      </div>
      <ul className="m-0 mt-xs flex list-none flex-col gap-xs p-0">
        {data.answers.map(({ user, outcome }) => (
          <li key={user.id} className="flex items-center gap-sm">
            <UserAvatar url={user.avatar_url} name={user.display_name} size="sm" />
            <Link
              href={`/profile/${user.id}`}
              className="min-w-0 flex-1 truncate text-sm font-bold text-foreground hover:underline"
            >
              {user.display_name ?? t("profile.unnamed")}
            </Link>
            <Tag active={outcome === "correct"}>{outcomeLabel(t, outcome)}</Tag>
          </li>
        ))}
      </ul>
    </section>
  );
}
