"use client";

import type { UserSummary } from "@lp/contracts";
import Link from "next/link";

import { Button } from "@/components/button";
import { Tag } from "@/components/chip";
import { UserAvatar } from "@/components/user-avatar";
import { useI18n } from "@/lib/i18n";
import { useFollow } from "@/lib/use-follow";

/** Follow or unfollow one learner. Shows "Following" once followed, and
 * the accessible name always says what a click will do. */
export function FollowButton({ user }: { user: UserSummary }) {
  const { t } = useI18n();
  const follow = useFollow();
  const name = user.display_name ?? t("profile.unnamed");
  return (
    <Button
      variant={user.is_following ? "secondary" : "primary"}
      aria-label={
        user.is_following ? t("social.unfollowName", { name }) : t("social.followName", { name })
      }
      disabled={follow.isPending}
      onClick={() => follow.mutate({ userId: user.id, follow: !user.is_following })}
    >
      {user.is_following ? t("social.following") : t("social.follow")}
    </Button>
  );
}

/** One learner as a ruled row: who they are, linking to their profile, and
 * what you can do about them. */
export function UserRow({ user, onRemove }: { user: UserSummary; onRemove?: () => void }) {
  const { t } = useI18n();
  const name = user.display_name ?? t("profile.unnamed");
  return (
    <li className="flex items-center gap-md border-t border-border py-sm">
      <Link href={`/profile/${user.id}`} className="flex min-w-0 flex-1 items-center gap-sm">
        <UserAvatar url={user.avatar_url} name={user.display_name} size="sm" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-ui font-bold text-foreground">{name}</span>
          {user.university && (
            <span className="truncate text-caption text-muted-foreground">{user.university}</span>
          )}
        </span>
      </Link>
      {user.follows_you && <Tag>{t("social.followsYou")}</Tag>}
      {onRemove && (
        <Button
          variant="ghost"
          aria-label={t("social.removeFollowerName", { name })}
          onClick={onRemove}
        >
          {t("social.remove")}
        </Button>
      )}
      <FollowButton user={user} />
    </li>
  );
}
