"use client";

import type { MeResponse } from "@lp/contracts";
import type { Language } from "@lp/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getBrowserApiClient } from "@/lib/api-client.browser";

/** The settings fields a control can write on its own. */
export type SettingsPatch = {
  theme?: string;
  notifications_enabled?: boolean;
  language?: Language;
  profile_public?: boolean;
};

/**
 * Writes one settings field the moment it changes.
 *
 * The sections built on this have no Save button. A switch that needs
 * confirming lies about the state of things until the second click: the one on
 * screen said notifications were on while the account still had them off, and
 * leaving the page lost the change without a word. The cache is updated before
 * the request leaves, so the control moves at once; a failure puts the old
 * value back and the page says so -- the only job Save was really doing.
 *
 * Text fields (Profile, Account) keep their Save: writing per keystroke would
 * be a request per letter, and half a name is a worse thing to store than an
 * unsaved one.
 *
 * The mobile twin is `useSettingsWriter` in
 * apps/mobile/src/lib/settings-sections.tsx -- same cache key, same optimistic
 * write, so both platforms behave the same way.
 */
export function useSettingsWriter(onSaved?: (updated: MeResponse) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => getBrowserApiClient().updateMe(patch),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<MeResponse>(["me"]);
      if (previous) {
        queryClient.setQueryData<MeResponse>(["me"], {
          ...previous,
          // Flat in the request, nested in the response -- every key here is
          // a settings field, so the mapping is this one spread.
          settings: { ...previous.settings, ...patch },
        });
      }
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(["me"], context.previous);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      onSaved?.(updated);
    },
  });
}
