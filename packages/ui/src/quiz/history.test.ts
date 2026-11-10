import { describe, expect, test } from "vitest";

import { attemptPercent, summarizePastExams } from "./history";

describe("attemptPercent", () => {
  test("rounds the ratio to a whole percent", () => {
    expect(attemptPercent({ points_awarded: 18, points_possible: 24 })).toBe(75);
    expect(attemptPercent({ points_awarded: 2, points_possible: 3 })).toBe(67);
  });

  test("is null when the attempt never scored, but zero is a real score", () => {
    // A cancelled or expired attempt has no score at all. That is distinct
    // from answering everything wrong, which is a result and reads as 0%.
    expect(attemptPercent({ points_awarded: null, points_possible: 10 })).toBeNull();
    expect(attemptPercent({ points_awarded: 0, points_possible: 10 })).toBe(0);
  });

  test("is null rather than NaN when nothing was at stake", () => {
    expect(attemptPercent({ points_awarded: 0, points_possible: 0 })).toBeNull();
  });
});

describe("summarizePastExams", () => {
  test("counts every attempt but averages only the scored ones", () => {
    // The unscored attempt is still one the reader made, so `taken` includes
    // it -- otherwise the count disagrees with the list beneath it. It has no
    // score, and treating that as a zero would misreport the average as 50.
    const summary = summarizePastExams([
      { points_awarded: 10, points_possible: 10 },
      { points_awarded: null, points_possible: null },
    ]);

    expect(summary).toEqual({ taken: 2, averagePercent: 100, bestPercent: 100 });
  });

  test("reports the best scored attempt", () => {
    const summary = summarizePastExams([
      { points_awarded: 5, points_possible: 10 },
      { points_awarded: 9, points_possible: 10 },
      { points_awarded: 7, points_possible: 10 },
    ]);

    expect(summary.averagePercent).toBe(70);
    expect(summary.bestPercent).toBe(90);
  });

  test("has no average or best when nothing scored", () => {
    const summary = summarizePastExams([
      { points_awarded: null, points_possible: null },
      { points_awarded: null, points_possible: null },
    ]);

    expect(summary).toEqual({ taken: 2, averagePercent: null, bestPercent: null });
  });

  test("is empty-safe", () => {
    expect(summarizePastExams([])).toEqual({
      taken: 0,
      averagePercent: null,
      bestPercent: null,
    });
  });
});
