import { Text, View } from "react-native";

import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

// Threshold for the "done" color, matching the server's
// LESSON_COMPLETION_THRESHOLD (services/api/app/progress/constants.py) —
// kept in sync by eye rather than shared over the wire, since it only
// controls which color a bar renders in, never a completion decision.
const DONE_THRESHOLD = 80;

/**
 * A horizontal completion bar for one Library node (lesson, sub-chapter,
 * chapter, book). Mirrors apps/web/src/components/progress-bar.tsx. Renders
 * nothing when `percent` is null — a node with no eligible lessons has no
 * completion to show, same "nothing to show" treatment BankStatsLine gives
 * a zero-question node.
 *
 * `stacked` puts the label on its own line above the bar. A phone has room
 * for a worded label *or* a bar worth looking at, not both on one line: the
 * book screen's "Overall progress" took half the width and left the bar a
 * stub beside it. The percentage stays at the end of the bar either way.
 */
export function ProgressBar({
  percent,
  label,
  stacked = false,
}: {
  percent: number | null;
  label?: string;
  stacked?: boolean;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  if (percent === null) return null;
  const rounded = Math.round(percent);
  const bar = (
    <View style={styles.row}>
      {label && !stacked && <Text style={styles.label}>{label}</Text>}
      <View
        testID="progress-bar"
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: rounded }}
        accessibilityLabel={label ?? t("profile.progress")}
      >
        <View
          style={[
            styles.fill,
            { width: `${rounded}%` },
            rounded >= DONE_THRESHOLD ? styles.fillDone : styles.fillInProgress,
          ]}
        />
      </View>
      <Text style={styles.label}>{rounded}%</Text>
    </View>
  );
  if (!stacked || !label) return bar;
  return (
    <View>
      <Text style={styles.stackedLabel}>{label}</Text>
      {bar}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    flexShrink: 0,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  // Above the bar, this is the section heading for it, so it reads as the
  // kickers everywhere else do.
  stackedLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  fillInProgress: {
    backgroundColor: colors.primary,
  },
  fillDone: {
    backgroundColor: colors.success,
  },
}));
