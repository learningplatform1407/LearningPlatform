import { describe, expect, test } from "vitest";

import { cannotBeChallengedWith, latestChallenges, type ChallengeOrigin } from "./challenges";

function origin(overrides: Partial<ChallengeOrigin> = {}): ChallengeOrigin {
  return {
    direction: "incoming",
    your_session_id: null,
    opponent: { id: "u2" },
    ...overrides,
  };
}

describe("latestChallenges", () => {
  test("keeps the first, which the API returns newest first", () => {
    expect(latestChallenges(["a", "b", "c"])).toEqual(["a"]);
  });

  test("an empty list stays empty rather than becoming a row of nothing", () => {
    expect(latestChallenges([])).toEqual([]);
  });
});

describe("cannotBeChallengedWith", () => {
  test("bars the person whose challenge you answered in this session", () => {
    const blocked = cannotBeChallengedWith(
      [origin({ your_session_id: "s1", opponent: { id: "bea" } })],
      "s1",
    );

    expect([...blocked]).toEqual(["bea"]);
  });

  test("bars nobody for an exam you started yourself", () => {
    const blocked = cannotBeChallengedWith(
      [origin({ your_session_id: "s1", opponent: { id: "bea" } })],
      "s9",
    );

    expect(blocked.size).toBe(0);
  });

  test("a challenge you sent bars nobody: those questions are yours", () => {
    // Your own session id appears on a sent challenge too -- it is the attempt
    // the challenge was made from. Only an answer to someone else's questions
    // takes them out of the picker.
    const blocked = cannotBeChallengedWith(
      [origin({ direction: "sent", your_session_id: "s1", opponent: { id: "bea" } })],
      "s1",
    );

    expect(blocked.size).toBe(0);
  });

  test("a challenge not yet accepted has no session to match", () => {
    expect(cannotBeChallengedWith([origin()], "s1").size).toBe(0);
  });

  test("two people whose challenges you answered in the same session are both barred", () => {
    // Not reachable today (one session answers one challenge), but the rule is
    // "whoever set these questions", not "the one person who did".
    const blocked = cannotBeChallengedWith(
      [
        origin({ your_session_id: "s1", opponent: { id: "bea" } }),
        origin({ your_session_id: "s1", opponent: { id: "cris" } }),
      ],
      "s1",
    );

    expect([...blocked].sort()).toEqual(["bea", "cris"]);
  });
});
