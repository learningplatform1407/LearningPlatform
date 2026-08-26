import { createApiClient } from "@lp/api-client";

import { apiBaseUrl } from "./env";
import { createClient } from "./supabase/client";

export function getBrowserApiClient() {
  const supabase = createClient();
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
