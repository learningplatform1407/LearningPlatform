import type { BankStatsCounts } from "@lp/api-client";
import { computeBankStatsRates } from "@lp/api-client";
import { StyleSheet, Text } from "react-native";

import { colors, fontSizes } from "@/lib/theme";

function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/**
 * A compact success/failure/pending/average-score line for one bank node
 * (lesson, sub-chapter, chapter, book, the uncategorized bucket, the
 * unassigned bucket, or the whole tree). Mirrors
 * apps/web/src/components/bank-stats-line.tsx. Renders nothing for an empty
 * node — a rate over zero questions is not a stat, it's a divide-by-zero
 * waiting to happen, which is exactly why computeBankStatsRates returns null
 * there.
 */
export function BankStatsLine({ counts }: { counts: BankStatsCounts }) {
  if (counts.question_count === 0) return null;
  const rates = computeBankStatsRates(counts);
  return (
    <Text style={styles.text}>
      {formatPercent(rates.success_rate)} success · {formatPercent(rates.failure_rate)} failing ·{" "}
      {rates.pending_count} pending · avg score {formatPercent(rates.average_score)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
});
