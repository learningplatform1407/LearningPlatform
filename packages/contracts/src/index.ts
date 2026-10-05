import type { z } from "zod";

import type {
  accountSettingsSchema,
  annotationCreateRequestSchema,
  annotationResponseSchema,
  bookCreateRequestSchema,
  bookResponseSchema,
  chapterCreateRequestSchema,
  chapterResponseSchema,
  clozeCardResponseSchema,
  clozeRatingRequestSchema,
  clozeRatingSchema,
  clozeReviewStateResponseSchema,
  documentCreateRequestSchema,
  documentResponseSchema,
  documentSummaryResponseSchema,
  documentVersionResponseSchema,
  entitlementResponseSchema,
  extractedContentSchema,
  flashcardCardSchema,
  flashcardCreateRequestSchema,
  flashcardImportItemSchema,
  flashcardImportRequestSchema,
  flashcardImportResultSchema,
  flashcardRatingRequestSchema,
  flashcardResponseSchema,
  flashcardReviewStateResponseSchema,
  flashcardScopeFilterSchema,
  flashcardScopeSchema,
  flashcardStatusSchema,
  flashcardSummaryResponseSchema,
  flashcardUpdateRequestSchema,
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
  recentLessonResponseSchema,
  reviewRatingSchema,
  reviewSummaryBookSchema,
  reviewSummaryChapterSchema,
  reviewSummaryLessonSchema,
  reviewSummaryResponseSchema,
  reviewSummarySubChapterSchema,
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
export type Flashcard = z.infer<typeof flashcardResponseSchema>;
export type FlashcardScope = z.infer<typeof flashcardScopeSchema>;
export type FlashcardStatus = z.infer<typeof flashcardStatusSchema>;
export type FlashcardScopeFilter = z.infer<typeof flashcardScopeFilterSchema>;
export type FlashcardCard = z.infer<typeof flashcardCardSchema>;
export type FlashcardCreateRequest = z.infer<typeof flashcardCreateRequestSchema>;
export type FlashcardUpdateRequest = z.infer<typeof flashcardUpdateRequestSchema>;
export type FlashcardRatingRequest = z.infer<typeof flashcardRatingRequestSchema>;
export type FlashcardReviewState = z.infer<typeof flashcardReviewStateResponseSchema>;
export type FlashcardImportItem = z.infer<typeof flashcardImportItemSchema>;
export type FlashcardImportRequest = z.infer<typeof flashcardImportRequestSchema>;
export type FlashcardImportResult = z.infer<typeof flashcardImportResultSchema>;
export type FlashcardSummaryResponse = z.infer<typeof flashcardSummaryResponseSchema>;
/** The four SM-2 grades, shared by Review and Flashcards. */
export type ReviewRating = z.infer<typeof reviewRatingSchema>;
export type ClozeRating = z.infer<typeof clozeRatingSchema>;
export type ClozeCard = z.infer<typeof clozeCardResponseSchema>;
export type ClozeRatingRequest = z.infer<typeof clozeRatingRequestSchema>;
export type ClozeReviewState = z.infer<typeof clozeReviewStateResponseSchema>;
export type ReviewSummaryLesson = z.infer<typeof reviewSummaryLessonSchema>;
export type ReviewSummarySubChapter = z.infer<typeof reviewSummarySubChapterSchema>;
export type ReviewSummaryChapter = z.infer<typeof reviewSummaryChapterSchema>;
export type ReviewSummaryBook = z.infer<typeof reviewSummaryBookSchema>;
export type ReviewSummaryResponse = z.infer<typeof reviewSummaryResponseSchema>;
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
