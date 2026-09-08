import type { z } from "zod";

import type {
  accountSettingsSchema,
  annotationCreateRequestSchema,
  annotationResponseSchema,
  chapterCreateRequestSchema,
  chapterResponseSchema,
  documentCreateRequestSchema,
  documentResponseSchema,
  documentSummaryResponseSchema,
  documentVersionResponseSchema,
  entitlementResponseSchema,
  extractedContentSchema,
  meResponseSchema,
  profileUpdateRequestSchema,
  recentLessonResponseSchema,
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
} from "@lp/validation";

export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>;
export type EntitlementResponse = z.infer<typeof entitlementResponseSchema>;
export type ExtractedContent = z.infer<typeof extractedContentSchema>;
export type DocumentVersionResponse = z.infer<typeof documentVersionResponseSchema>;
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export type DocumentSummaryResponse = z.infer<typeof documentSummaryResponseSchema>;
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;
export type DocumentCreateRequest = z.infer<typeof documentCreateRequestSchema>;
export type Annotation = z.infer<typeof annotationResponseSchema>;
export type AnnotationCreateRequest = z.infer<typeof annotationCreateRequestSchema>;
export type Chapter = z.infer<typeof chapterResponseSchema>;
export type ChapterCreateRequest = z.infer<typeof chapterCreateRequestSchema>;
export type RecentLesson = z.infer<typeof recentLessonResponseSchema>;
