import { z } from "zod";

export const accountSettingsSchema = z.object({
  theme: z.string(),
  notifications_enabled: z.boolean(),
});

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  university: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  settings: accountSettingsSchema,
});

export const profileUpdateRequestSchema = z.object({
  display_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  university: z.string().nullable().optional(),
});

export const entitlementResponseSchema = z.object({
  feature_key: z.string(),
  limit_value: z.number().nullable(),
});

export const entitlementsResponseSchema = z.array(entitlementResponseSchema);
