import { formatMonthYear } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import { ActivityList } from "@/lib/activity-list";
import { getApiClient } from "@/lib/api-client";
import { ProfileStats } from "@/lib/profile-stats";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { SettingsIcon } from "@/lib/ui/icons";
import { Dot } from "@/lib/ui/primitives";
import { useI18n } from "@/lib/i18n";

export default function ProfileScreen() {
  const { t, language } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  // Independent of the identity query above: the stats section is secondary
  // data that must degrade gracefully (its own loading/error state) without
  // ever blocking the already-working identity section. Mirrors the web
  // profile page.
  const statsQuery = useQuery({
    queryKey: ["me-stats"],
    queryFn: () => getApiClient().getMyStats(),
  });
  // A tab stays mounted once visited, so without this the numbers stayed as
  // they were the first time Profile was opened -- an exam finished since
  // then only showed after restarting the app. Re-read whenever the tab
  // comes back into view.
  const { refetch: refetchStats } = statsQuery;
  const following = useQuery({
    queryKey: ["following"],
    queryFn: () => getApiClient().listFollowing(),
  });
  const followers = useQuery({
    queryKey: ["followers"],
    queryFn: () => getApiClient().listFollowers(),
  });
  const { refetch: refetchFollowers } = followers;
  const followsAnyone = (following.data?.length ?? 0) > 0;
  const activity = useQuery({
    queryKey: ["activity", "recent"],
    queryFn: () => getApiClient().listFollowingActivity({ limit: 5 }),
    enabled: followsAnyone,
  });
  const { refetch: refetchActivity } = activity;
  useFocusEffect(
    useCallback(() => {
      refetchStats();
      refetchFollowers();
      if (followsAnyone) refetchActivity();
    }, [refetchStats, refetchFollowers, refetchActivity, followsAnyone]),
  );

  if (isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.error}>
          {t("common.failedToLoadProfile", { message: (error as Error).message })}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <View style={styles.avatar}>
            {data.avatar_url ? (
              <Image source={{ uri: data.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>
                {(data.display_name ?? data.email ?? "?").slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.kicker}>{t("profile.title")}</Text>
            <Text style={styles.name} accessibilityRole="header">
              {data.display_name ?? data.email ?? t("profile.unnamed")}
            </Text>
            <Text style={styles.joined}>
              {t("profile.joined", { date: formatMonthYear(data.created_at, language) })}
            </Text>
          </View>
        </View>
        {/* The design's round dot with the line-icon gear, as on the web --
            not the ⚙ text glyph, which each Android font draws differently. */}
        <Dot label={t("nav.settings")} onPress={() => router.push("/settings")}>
          <SettingsIcon color={colors.foreground} size={20} strokeWidth={1.8} />
        </Dot>
      </View>

      {following.data && followers.data && (
        <View style={styles.counts}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/profile/people?tab=followers")}
          >
            <Text style={styles.count}>
              {t("social.followersCount", { count: followers.data.length })}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/profile/people?tab=following")}
          >
            <Text style={styles.count}>
              {t("social.followingCount", { count: following.data.length })}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push("/settings/profile")}
          accessibilityRole="button"
        >
          <Text style={styles.editButtonText}>{t("profile.editProfile")}</Text>
        </Pressable>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push("/profile/people")}
          accessibilityRole="button"
        >
          <Text style={styles.editButtonText}>{t("social.findPeople")}</Text>
        </Pressable>
      </View>

      <View style={styles.statsSection}>
        {statsQuery.isPending && <Text style={styles.loading}>{t("profile.loadingStats")}</Text>}
        {statsQuery.data && <ProfileStats stats={statsQuery.data} />}
      </View>

      {followsAnyone && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("social.activity.title")}</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/profile/people?tab=activity")}
            >
              <Text style={styles.link}>{t("social.activity.seeAll")}</Text>
            </Pressable>
          </View>
          {activity.data &&
            (activity.data.length > 0 ? (
              <ActivityList events={activity.data} />
            ) : (
              <Text style={styles.loading}>{t("social.activity.empty")}</Text>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const AVATAR_SIZE = 64;

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  centered: {
    justifyContent: "center",
    padding: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerIdentity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
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
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
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
  joined: {
    marginTop: spacing.xs / 2,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  counts: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: -spacing.sm,
  },
  count: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.mutedForeground,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  editButtonText: {
    color: colors.foreground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  link: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  statsSection: {
    gap: spacing.lg,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
}));
