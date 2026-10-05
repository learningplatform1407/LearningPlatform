import { StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, spacing } from "@/lib/theme";

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
 */
export function ProgressBar({ percent, label }: { percent: number | null; label?: string }) {
  if (percent === null) return null;
  const rounded = Math.round(percent);
  return (
    <View style={styles.row}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        testID="progress-bar"
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: rounded }}
        accessibilityLabel={label ?? "Progress"}
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
}

const styles = StyleSheet.create({
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
});
