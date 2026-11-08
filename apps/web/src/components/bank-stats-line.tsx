import type { BankStatsCounts } from "@lp/api-client";
import { computeBankStatsRates } from "@lp/api-client";

import { useI18n } from "@/lib/i18n";

function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/**
 * A compact success/failure/pending/average-score line for one bank node
 * (lesson, sub-chapter, chapter, book, the uncategorized bucket, the
 * unassigned bucket, or the whole tree). Renders nothing for an empty node —
 * a rate over zero questions is not a stat, it's a divide-by-zero waiting to
 * happen, which is exactly why computeBankStatsRates returns null there.
 */
export function BankStatsLine({ counts }: { counts: BankStatsCounts }) {
  const { t } = useI18n();
  if (counts.question_count === 0) return null;
  if (counts.answered_count === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("questions.waiting", { count: counts.question_count })}
      </p>
    );
  }
  const rates = computeBankStatsRates(counts);
  return (
    <p className="text-xs text-muted-foreground">
      {t("questions.statsLine", {
        success: formatPercent(rates.success_rate),
        failure: formatPercent(rates.failure_rate),
        pending: rates.pending_count,
        average: formatPercent(rates.average_score),
      })}
    </p>
  );
}
