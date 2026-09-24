import type { z } from "zod";

import type {
  accountSettingsSchema,
  annotationCreateRequestSchema,
  annotationResponseSchema,
  bookCreateRequestSchema,
  bookResponseSchema,
  chapterCreateRequestSchema,
  chapterResponseSchema,
  documentCreateRequestSchema,
  documentResponseSchema,
  documentSummaryResponseSchema,
  documentVersionResponseSchema,
  entitlementResponseSchema,
  extractedContentSchema,
  flashcardResponseSchema,
  questionImportErrorSchema,
  questionImportRequestSchema,
  questionImportResultSchema,
  meResponseSchema,
  notebookEntryCreateRequestSchema,
  notebookEntryResponseSchema,
  notebookEntryUpdateRequestSchema,
  profileUpdateRequestSchema,
  questionCreateRequestSchema,
  questionOptionSchema,
  questionResponseSchema,
  questionUpdateRequestSchema,
  quizResponseSchema,
  recentLessonResponseSchema,
  strokePointSchema,
  strokeSchema,
  subChapterCreateRequestSchema,
  subChapterResponseSchema,
  tagResponseSchema,
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
export type Book = z.infer<typeof bookResponseSchema>;
export type BookCreateRequest = z.infer<typeof bookCreateRequestSchema>;
export type Chapter = z.infer<typeof chapterResponseSchema>;
export type ChapterCreateRequest = z.infer<typeof chapterCreateRequestSchema>;
export type RecentLesson = z.infer<typeof recentLessonResponseSchema>;
export type SubChapter = z.infer<typeof subChapterResponseSchema>;
export type SubChapterCreateRequest = z.infer<typeof subChapterCreateRequestSchema>;
export type Quiz = z.infer<typeof quizResponseSchema>;
export type Flashcard = z.infer<typeof flashcardResponseSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type StrokePoint = z.infer<typeof strokePointSchema>;
export type NotebookEntry = z.infer<typeof notebookEntryResponseSchema>;
export type NotebookEntryCreateRequest = z.infer<typeof notebookEntryCreateRequestSchema>;
export type NotebookEntryUpdateRequest = z.infer<typeof notebookEntryUpdateRequestSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type Question = z.infer<typeof questionResponseSchema>;
export type QuestionCreateRequest = z.infer<typeof questionCreateRequestSchema>;
export type QuestionUpdateRequest = z.infer<typeof questionUpdateRequestSchema>;
export type Tag = z.infer<typeof tagResponseSchema>;
export type QuestionImportRequest = z.infer<typeof questionImportRequestSchema>;
export type QuestionImportResult = z.infer<typeof questionImportResultSchema>;
export type QuestionImportError = z.infer<typeof questionImportErrorSchema>;
