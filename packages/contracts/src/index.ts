import type { z } from "zod";

import type {
  accountSettingsSchema,
  entitlementResponseSchema,
  meResponseSchema,
  profileUpdateRequestSchema,
} from "@lp/validation";

export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>;
export type EntitlementResponse = z.infer<typeof entitlementResponseSchema>;
