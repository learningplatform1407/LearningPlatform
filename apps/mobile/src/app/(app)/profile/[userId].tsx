import { ApiClientError } from "@lp/api-client";
import { formatMonthYear } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { ProfileStats } from "@/lib/profile-stats";
import { FollowButton, UserAvatar } from "@/lib/social";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { Tag } from "@/lib/ui/primitives";

/** Another learner's profile: who they are and the same stats block your own
 * Profile screen shows. Private and unknown users are both a 404 from the
 * API, deliberately indistinguishable. */
export default function PublicProfileScreen() {
  const { t, language } = useI18n();
  const styles = useStyles();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const profile = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getApiClient().getUserProfile(userId),
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status === 404) && count < 3,
  });

  if (profile.isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.muted}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (profile.isError) {
    const notFound = profile.error instanceof ApiClientError && profile.error.status === 404;
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.muted}>
          {notFound
            ? t("social.notFound")
            : t("social.loadFailed", { message: (profile.error as Error).message })}
        </Text>
        <Pressable accessibilityRole="link" onPress={() => router.replace("/profile/people")}>
          <Text style={styles.link}>{t("social.findPeople")}</Text>
        </Pressable>
      </View>
    );
  }

  const user = profile.data;
  const isMe = me.data?.id === user.id;
  const subtitle = [
    user.university,
    t("profile.joined", { date: formatMonthYear(user.created_at, language) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <UserAvatar url={user.avatar_url} name={user.display_name} size="lg" />
        <View style={styles.identity}>
          <Text style={styles.kicker}>{t("social.learner")}</Text>
          <Text style={styles.name} accessibilityRole="header">
            {user.display_name ?? t("profile.unnamed")}
          </Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
      </View>

      {!isMe && (
        <View style={styles.actions}>
          <FollowButton user={user} />
          {user.follows_you && <Tag>{t("social.followsYou")}</Tag>}
        </View>
      )}

      <View style={styles.counts}>
        <Text style={styles.count}>
          {t("social.followersCount", { count: user.followers_count })}
        </Text>
        <Text style={styles.count}>
          {t("social.followingCount", { count: user.following_count })}
        </Text>
      </View>

      <ProfileStats stats={user.stats} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingTop: 30,
  },
  identity: {
    flex: 1,
  },
  kicker: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.7,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  name: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  counts: {
    flexDirection: "row",
    gap: spacing.md,
  },
  count: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.mutedForeground,
  },
  muted: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  link: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
}));
