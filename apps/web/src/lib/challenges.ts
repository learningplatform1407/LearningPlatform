import { useQuery } from "@tanstack/react-query";

import { getBrowserApiClient } from "@/lib/api-client.browser";

export const CHALLENGES_KEY = ["challenges"];

/** Challenges you've sent and received. Shared by the Exam Hub and the
 * sidebar badge, so both read one cached request. */
export function useChallenges() {
  return useQuery({
    queryKey: CHALLENGES_KEY,
    queryFn: () => getBrowserApiClient().listChallenges(),
  });
}

/** How many challenges are waiting for your answer. */
export function usePendingChallengeCount(): number {
  const challenges = useChallenges();
  return (
    challenges.data?.filter((c) => c.direction === "incoming" && c.status === "pending").length ?? 0
  );
}
