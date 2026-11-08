import { Text, View } from "react-native";

import { fontSizes, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

/**
 * A labeled multi-row percentage-bar comparison. Mirrors
 * apps/web/src/components/metric-bar-chart.tsx. A null percent renders an
 * empty track and t("profile.noData") instead of a number — same null-is-not-zero
 * posture as ProgressBar.
 */
export function MetricBarChart({
  metrics,
}: {
  metrics: { label: string; percent: number | null }[];
}) {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.container}>
      {metrics.map((metric) => {
        const rounded = metric.percent === null ? null : Math.round(metric.percent);
        return (
          <View key={metric.label} style={styles.row}>
            <Text style={styles.label}>{metric.label}</Text>
            <View
              testID="metric-bar"
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityValue={rounded === null ? undefined : { min: 0, max: 100, now: rounded }}
              accessibilityLabel={metric.label}
            >
              {rounded !== null && <View style={[styles.fill, { width: `${rounded}%` }]} />}
            </View>
            <Text style={styles.value}>
              {rounded === null ? t("profile.noData") : `${rounded}%`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    width: 110,
    flexShrink: 0,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  value: {
    width: 70,
    flexShrink: 0,
    textAlign: "right",
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
}));
