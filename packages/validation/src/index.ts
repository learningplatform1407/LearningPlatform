import { z } from "zod";

export const accountSettingsSchema = z.object({
  theme: z.string(),
  notifications_enabled: z.boolean(),
  language: z.string(),
});

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  university: z.string().nullable(),
  role: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  settings: accountSettingsSchema,
});

export const profileUpdateRequestSchema = z.object({
  display_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  university: z.string().nullable().optional(),
  theme: z.string().optional(),
  notifications_enabled: z.boolean().optional(),
  language: z.string().optional(),
});

export const entitlementResponseSchema = z.object({
  feature_key: z.string(),
  limit_value: z.number().nullable(),
});

export const entitlementsResponseSchema = z.array(entitlementResponseSchema);

export const extractedBlockSchema = z.object({
  type: z.enum(["heading", "paragraph", "image"]),
  text: z.string().optional(),
  page: z.number(),
  image_path: z.string().optional(),
});

export const extractedContentSchema = z.object({
  blocks: z.array(extractedBlockSchema),
});

export const documentVersionStatusSchema = z.enum(["processing", "ready", "failed"]);

export const documentVersionResponseSchema = z.object({
  id: z.string(),
  status: documentVersionStatusSchema,
  error_message: z.string().nullable(),
  extracted_content: extractedContentSchema.nullable(),
  created_at: z.string(),
});

export const documentResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  current_version: documentVersionResponseSchema.nullable(),
});

export const documentSummaryResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  status: documentVersionStatusSchema.nullable(),
});

export const uploadUrlRequestSchema = z.object({
  filename: z.string(),
  mime_type: z.literal("application/pdf"),
  size_bytes: z.number(),
});

export const uploadUrlResponseSchema = z.object({
  storage_path: z.string(),
  token: z.string(),
});

export const documentCreateRequestSchema = z.object({
  title: z.string(),
  storage_path: z.string(),
  mime_type: z.literal("application/pdf"),
  size_bytes: z.number(),
  checksum: z.string(),
  chapter_id: z.string().nullable().optional(),
});

export const recentLessonResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  status: documentVersionStatusSchema.nullable(),
  last_viewed_at: z.string(),
});

export const chapterResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  order_index: z.number(),
  lesson_count: z.number(),
  created_at: z.string(),
});

export const chapterCreateRequestSchema = z.object({
  title: z.string(),
});

export const annotationTypeSchema = z.enum(["highlight", "margin_note"]);

export const annotationResponseSchema = z.object({
  id: z.string(),
  document_version_id: z.string(),
  type: annotationTypeSchema,
  block_index: z.number(),
  start_offset: z.number().nullable(),
  end_offset: z.number().nullable(),
  note_text: z.string().nullable(),
  color: z.string().nullable(),
  created_at: z.string(),
});

export const annotationCreateRequestSchema = z.object({
  type: annotationTypeSchema,
  block_index: z.number(),
  start_offset: z.number().nullable().optional(),
  end_offset: z.number().nullable().optional(),
  note_text: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});
