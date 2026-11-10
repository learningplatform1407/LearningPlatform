/** Scoring arithmetic for the Exam Hub's past-exams summary.
 *
 * Shared rather than derived on each platform: "average" is a judgement call
 * -- which attempts count, where rounding lands -- and two independent
 * implementations would eventually disagree about the same list of attempts.
 * Pure functions, so those decisions are testable without a renderer.
 *
 * Takes a structural subset of `QuizSessionHistoryItem` rather than importing
 * the type, so @lp/ui keeps not depending on @lp/api-client.
 */

export interface ScoredAttempt {
  points_awarded: number | null;
  points_possible: number | null;
}

/** An attempt's score as a percentage, or null when it never scored.
 *
 * A `points_possible` of 0 returns null rather than 0%: a quiz worth no
 * points has no score to express, and dividing would be a silent NaN.
 */
export function attemptPercent(attempt: ScoredAttempt): number | null {
  const { points_awarded: awarded, points_possible: possible } = attempt;
  if (awarded === null || possible === null || possible === 0) return null;
  return Math.round((awarded / possible) * 100);
}

export interface PastExamsSummary {
  /** Every attempt in the list, scored or not. */
  taken: number;
  /** Mean of the scored attempts, or null when none scored. */
  averagePercent: number | null;
  /** Highest scored attempt, or null when none scored. */
  bestPercent: number | null;
}

/** The three numbers above the attempt list.
 *
 * `taken` counts every attempt, cancelled and expired ones included -- they
 * are attempts the reader made, and leaving them out would make the count
 * disagree with the list directly beneath it. The average and best consider
 * only attempts that produced a score: a cancelled attempt scoring nothing
 * would drag an average down in a way that reads as poor performance rather
 * than as an abandoned session.
 */
export function summarizePastExams(attempts: readonly ScoredAttempt[]): PastExamsSummary {
  const scored = attempts
    .map(attemptPercent)
    .filter((percent): percent is number => percent !== null);

  if (scored.length === 0) {
    return { taken: attempts.length, averagePercent: null, bestPercent: null };
  }

  const total = scored.reduce((sum, percent) => sum + percent, 0);
  return {
    taken: attempts.length,
    // Rounded once at the end, over the already-rounded per-attempt
    // percentages. Averaging the raw ratios instead would give a number that
    // cannot be reconciled with the rows on screen, which is the more
    // confusing of the two errors.
    averagePercent: Math.round(total / scored.length),
    bestPercent: Math.max(...scored),
  };
}
