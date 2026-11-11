"use client";

import type { ProfileStatsResponse } from "@lp/contracts";
import { computeProfileBadges } from "@lp/api-client";
import { badgeText } from "@lp/ui";

import { MetricBarChart } from "@/components/metric-bar-chart";
import { StatTile } from "@/components/stat-tile";
import { useI18n } from "@/lib/i18n";

/** The stats block of a profile -- tiles, accuracy bars and badges. Shared by
 * your own Profile page and another learner's public profile, so both show
 * exactly the same view of the same numbers. */
export function ProfileStats({ stats }: { stats: ProfileStatsResponse }) {
  const { t } = useI18n();
  // Derived with English text in api-client; shown in the reader's language.
  const badges = computeProfileBadges(stats).map((badge) => ({
    ...badge,
    ...badgeText(t, badge),
  }));

  return (
    <div className="flex flex-col gap-lg">
      <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
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
      </div>

      <div>
        <h2 className="label-caps mb-sm">{t("profile.accuracy")}</h2>
        <MetricBarChart
          metrics={[
            { label: t("profile.examAverage"), percent: stats.exam_average_score_percent },
            { label: t("profile.questionAccuracy"), percent: stats.question_accuracy_percent },
          ]}
        />
      </div>

      <div>
        <h2 className="label-caps mb-sm">{t("profile.badgesTitle")}</h2>
        <div className="flex flex-wrap gap-lg border-t border-border pt-md">
          {badges.map((badge) => (
            <div
              key={badge.id}
              role="group"
              aria-label={t("profile.badgeState", {
                badge: badge.label,
                state: badge.earned ? t("profile.earned") : t("profile.locked"),
              })}
              className="flex w-20 flex-col items-center gap-xs text-center"
            >
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-2xl ${
                  badge.earned ? "border-accent bg-cloze-bg" : "border-border opacity-40"
                }`}
              >
                <span aria-hidden="true">{badge.emoji}</span>
              </div>
              <span className="text-caption leading-tight font-bold text-foreground">
                {badge.label}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {badge.description}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
