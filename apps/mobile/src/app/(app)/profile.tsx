import { computeProfileBadges } from "@lp/api-client";
import { formatMonthYear } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { MetricBarChart } from "@/lib/metric-bar-chart";
import { StatTile } from "@/lib/stat-tile";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

export default function ProfileScreen() {
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

  if (isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.error}>Failed to load profile: {(error as Error).message}</Text>
      </View>
    );
  }

  const badges = statsQuery.data ? computeProfileBadges(statsQuery.data) : null;

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
            <Text style={styles.name}>{data.display_name ?? data.email ?? "Unnamed"}</Text>
            <Text style={styles.joined}>Joined {formatMonthYear(data.created_at)}</Text>
          </View>
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.editButton}
        onPress={() => router.push("/settings/profile")}
        accessibilityRole="button"
      >
        <Text style={styles.editButtonText}>Edit Profile</Text>
      </Pressable>

      <View style={styles.statsSection}>
        {statsQuery.isPending && <Text style={styles.loading}>Loading stats...</Text>}
        {statsQuery.data && (
          <>
            <View style={styles.statsGrid}>
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
            </View>

            <View>
              <Text style={styles.sectionTitle}>Accuracy & averages</Text>
              <MetricBarChart
                metrics={[
                  { label: "Exam average", percent: statsQuery.data.exam_average_score_percent },
                  {
                    label: "Question accuracy",
                    percent: statsQuery.data.question_accuracy_percent,
                  },
                ]}
              />
            </View>

            {badges && (
              <View>
                <Text style={styles.sectionTitle}>Badges</Text>
                <View style={styles.badgeCell}>
                  {badges.map((badge) => (
                    <View key={badge.id} style={styles.badge}>
                      <View
                        accessibilityRole="summary"
                        accessibilityLabel={`${badge.label}: ${badge.earned ? "earned" : "locked"}`}
                        style={[
                          styles.badgeCircle,
                          badge.earned ? styles.badgeCircleEarned : styles.badgeCircleLocked,
                        ]}
                      >
                        <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
                      </View>
                      <Text style={styles.badgeLabel}>{badge.label}</Text>
                      <Text style={styles.badgeDescription}>{badge.description}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const AVATAR_SIZE = 64;

const styles = StyleSheet.create({
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
  settingsButton: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  settingsIcon: {
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
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
  name: {
    fontSize: fontSizes.xl,
    lineHeight: lineHeight(fontSizes.xl, "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  joined: {
    marginTop: spacing.xs / 2,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
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
  statsSection: {
    gap: spacing.lg,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
  },
  badgeCell: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
  },
  badge: {
    width: 80,
    alignItems: "center",
    gap: spacing.xs / 2,
  },
  badgeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeCircleEarned: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "1a",
  },
  badgeCircleLocked: {
    borderColor: colors.border,
    opacity: 0.4,
  },
  badgeEmoji: {
    fontSize: fontSizes["2xl"],
  },
  badgeLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
    textAlign: "center",
  },
  badgeDescription: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
});
