import { createApiClient } from "@lp/api-client";

import { supabase } from "./supabase";

function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured. Add it to apps/mobile/.env.");
  }
  return url;
}

export function getApiClient() {
  return createApiClient({
    baseUrl: apiBaseUrl(),
    getAccessToken: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    },
  });
}
