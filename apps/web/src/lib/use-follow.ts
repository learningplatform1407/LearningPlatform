import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { PublicProfile, UserSummary } from "@lp/contracts";

import { getBrowserApiClient } from "@/lib/api-client.browser";

/** Every cached view that can show this user's follow button: search
 * results, both lists, and their profile. */
function setFollowing(queryClient: QueryClient, userId: string, isFollowing: boolean) {
  const patchRow = (row: UserSummary) =>
    row.id === userId ? { ...row, is_following: isFollowing } : row;
  for (const key of [["user-search"], ["following"], ["followers"]]) {
    queryClient.setQueriesData<UserSummary[]>({ queryKey: key }, (rows) => rows?.map(patchRow));
  }
  queryClient.setQueryData<PublicProfile>(["user", userId], (profile) =>
    profile
      ? {
          ...profile,
          is_following: isFollowing,
          followers_count: profile.followers_count + (isFollowing ? 1 : -1),
        }
      : profile,
  );
}

/** Follow or unfollow, flipped in the UI at once and put back if the request
 * fails. The lists are refetched afterwards, since following someone adds a
 * row the cache doesn't have. */
export function useFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow
        ? getBrowserApiClient().followUser(userId)
        : getBrowserApiClient().unfollowUser(userId),
    onMutate: ({ userId, follow }) => setFollowing(queryClient, userId, follow),
    onError: (_error, { userId, follow }) => setFollowing(queryClient, userId, !follow),
    onSettled: (_data, _error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: ["following"] });
      void queryClient.invalidateQueries({ queryKey: ["followers"] });
      void queryClient.invalidateQueries({ queryKey: ["user", userId] });
    },
  });
}

export function useRemoveFollower() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => getBrowserApiClient().removeFollower(userId),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<UserSummary[]>(["followers"], (rows) =>
        rows?.filter((row) => row.id !== userId),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["followers"] }),
  });
}
