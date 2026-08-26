import { createApiClient } from "@lp/api-client";

import { apiBaseUrl } from "./env";
import { createClient } from "./supabase/server";

export async function getServerApiClient() {
  const supabase = await createClient();
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
