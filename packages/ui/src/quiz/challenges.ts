/** What the Exam Hub shows of a challenge list, and who it may be sent to.
 *
 * Pure functions over the shape `listChallenges()` already returns, so both
 * platforms narrow the same list the same way -- and so the rules below are
 * testable without a renderer, like ./history.ts.
 */

/** How many challenges the Exam Hub shows before "View all".
 *
 * One: the hub's job is to say whether something is waiting for you, and the
 * list grew to `MAX_CHALLENGES_LISTED` (services/api/app/challenges/
 * constants.py) rows between the intro and the start form -- pushing the
 * whole screen down with challenges already dealt with. The full list is one
 * tap away, and `listChallenges()` returns newest first, so the one kept is
 * the latest.
 */
export const CHALLENGES_SHOWN_ON_HUB = 1;

/** The slice of `listChallenges()` the hub renders. */
export function latestChallenges<T>(challenges: readonly T[]): T[] {
  return challenges.slice(0, CHALLENGES_SHOWN_ON_HUB);
}

/** The subset of a challenge this module reads, so @lp/ui keeps not
 * depending on @lp/contracts (the same arrangement `ScoredAttempt` has). */
export interface ChallengeOrigin {
  direction: string;
  your_session_id: string | null;
  opponent: { id: string };
}

/**
 * Who may not be challenged with this quiz session: whoever sent you the
 * challenge you answered in it.
 *
 * Sending it back would mean asking them to beat their own score on the
 * questions they chose and have already answered. The API refuses it
 * (services/api/app/challenges/service.py); this is how both clients leave
 * that person out of the picker rather than offering a button that 409s.
 *
 * Derived from the challenge list both platforms already hold: for an
 * incoming challenge you accepted, `your_session_id` is the session you
 * answered in and `opponent` is the challenger.
 */
export function cannotBeChallengedWith(
  challenges: readonly ChallengeOrigin[],
  sessionId: string,
): Set<string> {
  return new Set(
    challenges
      .filter(
        (challenge) =>
          challenge.direction === "incoming" && challenge.your_session_id === sessionId,
      )
      .map((challenge) => challenge.opponent.id),
  );
}
