import type { PublicProfile, UserSummary } from "@lp/contracts";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { Tag } from "@/lib/ui/primitives";

/**
 * Following other learners -- the mobile side of apps/web/src/lib/use-follow.ts
 * and components/user-row.tsx. Same cache keys, so both platforms behave the
 * same way: the button flips at once and is put back if the request fails.
 */

/** Every cached view that can show this user's follow button. */
function setFollowing(queryClient: QueryClient, userId: string, isFollowing: boolean) {
  const patchRow = (row: UserSummary) =>
    row.id === userId ? { ...row, is_following: isFollowing } : row;
  for (const key of [["user-search"], ["following"], ["followers"]]) {
    queryClient.setQueriesData<UserSummary[]>({ queryKey: key }, (rows) => rows?.map(patchRow));
  }
  queryClient.setQueryData<PublicProfile>(["user", userId], (profile) =>
    profile
      ? {
          ...profile,
          is_following: isFollowing,
          followers_count: profile.followers_count + (isFollowing ? 1 : -1),
        }
      : profile,
  );
}

export function useFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow ? getApiClient().followUser(userId) : getApiClient().unfollowUser(userId),
    onMutate: ({ userId, follow }) => setFollowing(queryClient, userId, follow),
    onError: (_error, { userId, follow }) => setFollowing(queryClient, userId, !follow),
    onSettled: (_data, _error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: ["following"] });
      void queryClient.invalidateQueries({ queryKey: ["followers"] });
      void queryClient.invalidateQueries({ queryKey: ["user", userId] });
    },
  });
}

export function useRemoveFollower() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => getApiClient().removeFollower(userId),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<UserSummary[]>(["followers"], (rows) =>
        rows?.filter((row) => row.id !== userId),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["followers"] }),
  });
}

const AVATAR_SIZES = { sm: 36, md: 48, lg: 64 } as const;

/** A learner's round avatar: their picture, else the first letter of
 * whatever names them. */
export function UserAvatar({
  url,
  name,
  size = "md",
}: {
  url: string | null;
  name: string | null;
  size?: keyof typeof AVATAR_SIZES;
}) {
  const styles = useStyles();
  const box = AVATAR_SIZES[size];
  return (
    <View
      style={[styles.avatar, { width: box, height: box, borderRadius: box / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.avatarImage} />
      ) : (
        <Text style={[styles.avatarInitial, { fontSize: box / 2.6 }]}>
          {(name ?? "?").slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export function FollowButton({ user }: { user: UserSummary }) {
  const { t } = useI18n();
  const styles = useStyles();
  const follow = useFollow();
  const name = user.display_name ?? t("profile.unnamed");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        user.is_following ? t("social.unfollowName", { name }) : t("social.followName", { name })
      }
      disabled={follow.isPending}
      onPress={() => follow.mutate({ userId: user.id, follow: !user.is_following })}
      style={[styles.button, user.is_following ? styles.buttonSecondary : styles.buttonPrimary]}
    >
      <Text
        style={[
          styles.buttonText,
          user.is_following ? styles.buttonTextSecondary : styles.buttonTextPrimary,
        ]}
      >
        {user.is_following ? t("social.following") : t("social.follow")}
      </Text>
    </Pressable>
  );
}

/** One learner as a ruled row: who they are, opening their profile, and
 * what you can do about them. */
export function UserRow({ user, onRemove }: { user: UserSummary; onRemove?: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const name = user.display_name ?? t("profile.unnamed");
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.identity}
        accessibilityRole="link"
        accessibilityLabel={name}
        onPress={() => router.push(`/profile/${user.id}`)}
      >
        <UserAvatar url={user.avatar_url} name={user.display_name} size="sm" />
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {user.university ? (
            <Text style={styles.university} numberOfLines={1}>
              {user.university}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {user.follows_you && <Tag>{t("social.followsYou")}</Tag>}
      {onRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("social.removeFollowerName", { name })}
          onPress={onRemove}
          style={styles.button}
        >
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>{t("social.remove")}</Text>
        </Pressable>
      )}
      <FollowButton user={user} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  avatar: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  names: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
  university: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  button: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    borderColor: colors.border,
  },
  buttonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  buttonTextPrimary: {
    color: colors.primaryForeground,
  },
  buttonTextSecondary: {
    color: colors.foreground,
  },
}));
