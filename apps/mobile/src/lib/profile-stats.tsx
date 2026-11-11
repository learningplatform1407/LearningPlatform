import type { ProfileStatsResponse } from "@lp/contracts";
import { computeProfileBadges } from "@lp/api-client";
import { badgeText } from "@lp/ui";
import { Text, View } from "react-native";

import { useI18n } from "@/lib/i18n";
import { MetricBarChart } from "@/lib/metric-bar-chart";
import { StatTile } from "@/lib/stat-tile";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

/** The stats block of a profile -- tiles, accuracy bars and badges. Shared by
 * your own Profile screen and another learner's public profile, so both show
 * exactly the same view of the same numbers (as on the web). */
export function ProfileStats({ stats }: { stats: ProfileStatsResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  // Derived with English text in api-client; shown in the reader's language.
  const badges = computeProfileBadges(stats).map((badge) => ({
    ...badge,
    ...badgeText(t, badge),
  }));

  return (
    <>
      <View style={styles.statsGrid}>
        <StatTile
          emphasis
          label={t("profile.streak")}
          value={
            stats.current_streak_days > 0
              ? t("profile.streakDays", { count: stats.current_streak_days })
              : t("profile.noStreak")
          }
        />
        <StatTile
          emphasis
          label={t("profile.lessonsCompleted")}
          value={t("profile.lessonsOf", {
            completed: stats.lessons_completed,
            eligible: stats.lessons_eligible,
          })}
        />
        <StatTile emphasis label={t("profile.examsCompleted")} value={`${stats.exams_completed}`} />
      </View>

      <View>
        <Text style={styles.sectionTitle}>{t("profile.accuracy")}</Text>
        <MetricBarChart
          metrics={[
            { label: t("profile.examAverage"), percent: stats.exam_average_score_percent },
            { label: t("profile.questionAccuracy"), percent: stats.question_accuracy_percent },
          ]}
        />
      </View>

      <View>
        <Text style={styles.sectionTitle}>{t("profile.badgesTitle")}</Text>
        <View style={styles.badgeCell}>
          {badges.map((badge) => (
            <View key={badge.id} style={styles.badge}>
              <View
                accessibilityRole="summary"
                accessibilityLabel={t("profile.badgeState", {
                  badge: badge.label,
                  state: badge.earned ? t("profile.earned") : t("profile.locked"),
                })}
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
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
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
}));
