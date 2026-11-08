import type { BankStatsCounts } from "@lp/api-client";
import { computeBankStatsRates } from "@lp/api-client";
import { Text } from "react-native";

import { fontSizes } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
  const styles = useStyles();
  if (counts.question_count === 0) return null;
  if (counts.answered_count === 0) {
    return (
      <Text style={styles.text}>{t("questions.waiting", { count: counts.question_count })}</Text>
    );
  }
  const rates = computeBankStatsRates(counts);
  return (
    <Text style={styles.text}>
      {t("questions.statsLine", {
        success: formatPercent(rates.success_rate),
        failure: formatPercent(rates.failure_rate),
        pending: rates.pending_count,
        average: formatPercent(rates.average_score),
      })}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  text: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
}));
