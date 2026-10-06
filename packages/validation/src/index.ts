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

export const chapterSummarySchema = z.object({
  id: z.string(),
  book_id: z.string(),
  title: z.string(),
});

export const subChapterSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  chapter: chapterSummarySchema,
});

export const documentResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  current_version: documentVersionResponseSchema.nullable(),
  sub_chapter: subChapterSummarySchema.nullable().optional(),
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
  sub_chapter_id: z.string().nullable().optional(),
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
  book_id: z.string(),
  title: z.string(),
  order_index: z.number(),
  sub_chapter_count: z.number(),
  created_at: z.string(),
});

export const chapterCreateRequestSchema = z.object({
  title: z.string(),
});

export const bookResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  order_index: z.number(),
  chapter_count: z.number(),
  created_at: z.string(),
});

export const bookCreateRequestSchema = z.object({
  title: z.string(),
});

export const subChapterResponseSchema = z.object({
  id: z.string(),
  chapter_id: z.string(),
  title: z.string(),
  order_index: z.number(),
  lesson_count: z.number(),
  created_at: z.string(),
});

export const subChapterCreateRequestSchema = z.object({
  title: z.string(),
});

// `quizResponseSchema` is gone with the `quizzes` table — a lesson's
// questions are reached through the question bank (questions.document_id).

/** Where a card came from, and therefore who can see it. Written by the
 * endpoint that created it, never derived from the author's role. */
export const flashcardScopeSchema = z.enum(["official", "personal"]);

export const flashcardStatusSchema = z.enum(["draft", "published", "archived"]);

/** The All / Official / Mine toggle. */
export const flashcardScopeFilterSchema = z.enum(["all", "official", "personal"]);

export const flashcardResponseSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  front_text: z.string(),
  back_text: z.string(),
  scope: flashcardScopeSchema,
  status: flashcardStatusSchema,
  order_index: z.number(),
  is_mine: z.boolean(),
  /** Taken out of *this* learner's rotation. Per-user, so a shared official
   * card suspended by one person stays in everyone else's deck. */
  suspended: z.boolean(),
});

/** A card as the deck runner receives it. Carries `back_text` up front:
 * unlike a question, a flashcard's back is not an answer key, so the reveal
 * needs no second request and the client simply holds it until tapped. */
export const flashcardCardSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  front_text: z.string(),
  back_text: z.string(),
  scope: flashcardScopeSchema,
  is_mine: z.boolean(),
  due_at: z.string().nullable(),
  is_new: z.boolean(),
});

export const flashcardCreateRequestSchema = z.object({
  front_text: z.string().min(1),
  back_text: z.string().min(1),
});

export const flashcardUpdateRequestSchema = z.object({
  front_text: z.string().min(1).optional(),
  back_text: z.string().min(1).optional(),
});

/** The four SM-2 grades, shared by cloze Review and Flashcards — they run
 * separate queues over the same scheduler, so the grades must not drift. */
export const reviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);

/** @deprecated Use `reviewRatingSchema` — kept so cloze call sites keep
 * reading naturally. */
export const clozeRatingSchema = reviewRatingSchema;

export const flashcardRatingRequestSchema = z.object({
  rating: reviewRatingSchema,
});

/** Set, not toggled, so a retry or double-tap can't flip the card back in. */
export const flashcardSuspensionRequestSchema = z.object({
  suspended: z.boolean(),
});

export const flashcardReviewStateResponseSchema = z.object({
  id: z.string(),
  flashcard_id: z.string(),
  ease_factor: z.number(),
  interval_days: z.number(),
  repetitions: z.number(),
  suspended: z.boolean(),
  due_at: z.string(),
  last_reviewed_at: z.string().nullable(),
});

export const flashcardImportItemSchema = z.object({
  external_id: z.string().min(1),
  document_id: z.string(),
  front_text: z.string().min(1),
  back_text: z.string().min(1),
  order_index: z.number().optional(),
  status: flashcardStatusSchema.optional(),
});

export const flashcardImportRequestSchema = z.object({
  flashcards: z.array(flashcardImportItemSchema),
});

export const flashcardImportResultSchema = z.object({
  created: z.number(),
  updated: z.number(),
  skipped: z.number(),
  errors: z.array(z.object({ index: z.number(), field: z.string(), message: z.string() })),
});

const flashcardSummaryLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
  new_count: z.number(),
});

const flashcardSummarySubChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
  new_count: z.number(),
  lessons: z.array(flashcardSummaryLessonSchema),
});

const flashcardSummaryChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
  new_count: z.number(),
  sub_chapters: z.array(flashcardSummarySubChapterSchema),
});

const flashcardSummaryBookSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
  new_count: z.number(),
  chapters: z.array(flashcardSummaryChapterSchema),
});

export const flashcardSummaryResponseSchema = z.object({
  books: z.array(flashcardSummaryBookSchema),
  uncategorized_lessons: z.array(flashcardSummaryLessonSchema),
});

export const clozeCardResponseSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  block_index: z.number(),
  start_offset: z.number(),
  end_offset: z.number(),
  created_at: z.string(),
});

export const clozeRatingRequestSchema = z.object({
  rating: clozeRatingSchema,
});

export const clozeReviewStateResponseSchema = z.object({
  id: z.string(),
  cloze_card_id: z.string(),
  ease_factor: z.number(),
  interval_days: z.number(),
  repetitions: z.number(),
  due_at: z.string(),
  last_reviewed_at: z.string().nullable(),
});

export const reviewSummaryLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
});

export const reviewSummarySubChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
  lessons: z.array(reviewSummaryLessonSchema),
});

export const reviewSummaryChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
  sub_chapters: z.array(reviewSummarySubChapterSchema),
});

export const reviewSummaryBookSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_count: z.number(),
  chapters: z.array(reviewSummaryChapterSchema),
});

export const reviewSummaryResponseSchema = z.object({
  books: z.array(reviewSummaryBookSchema),
  uncategorized_lessons: z.array(reviewSummaryLessonSchema),
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

export const strokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z.number().nullable().optional(),
});

export const strokeSchema = z.object({
  color: z.string(),
  width: z.number(),
  points: z.array(strokePointSchema),
});

export const notebookEntryTypeSchema = z.enum(["text", "drawing"]);

export const notebookEntryResponseSchema = z.object({
  id: z.string(),
  type: notebookEntryTypeSchema,
  content: z.string().nullable(),
  strokes: z.array(strokeSchema).nullable(),
  source_document_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const notebookEntryCreateRequestSchema = z.object({
  type: notebookEntryTypeSchema,
  content: z.string().nullable().optional(),
  strokes: z.array(strokeSchema).nullable().optional(),
  source_document_id: z.string().nullable().optional(),
});

export const notebookEntryUpdateRequestSchema = z.object({
  content: z.string().nullable().optional(),
  strokes: z.array(strokeSchema).nullable().optional(),
});

export const questionOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const questionKindSchema = z.enum(["single", "multi"]);
export const questionDifficultySchema = z.enum(["easy", "medium", "hard"]);
export const questionStatusSchema = z.enum(["draft", "published", "archived"]);

export const questionResponseSchema = z.object({
  id: z.string(),
  external_id: z.string().nullable(),
  document_id: z.string().nullable(),
  prompt: z.string(),
  kind: questionKindSchema,
  scoring_scheme: z.string(),
  options: z.array(questionOptionSchema),
  correct_option_ids: z.array(z.string()),
  rationales: z.record(z.string(), z.string()),
  explanation: z.string().nullable(),
  difficulty: questionDifficultySchema,
  status: questionStatusSchema,
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const questionCreateRequestSchema = z.object({
  external_id: z.string().nullable().optional(),
  document_id: z.string().nullable().optional(),
  prompt: z.string(),
  kind: questionKindSchema,
  scoring_scheme: z.string(),
  options: z.array(questionOptionSchema),
  correct_option_ids: z.array(z.string()),
  rationales: z.record(z.string(), z.string()).optional(),
  explanation: z.string().nullable().optional(),
  difficulty: questionDifficultySchema.optional(),
  status: questionStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const questionUpdateRequestSchema = z.object({
  document_id: z.string().nullable().optional(),
  prompt: z.string().optional(),
  kind: questionKindSchema.optional(),
  scoring_scheme: z.string().optional(),
  options: z.array(questionOptionSchema).optional(),
  correct_option_ids: z.array(z.string()).optional(),
  rationales: z.record(z.string(), z.string()).optional(),
  explanation: z.string().nullable().optional(),
  difficulty: questionDifficultySchema.optional(),
  status: questionStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const tagResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  question_count: z.number(),
});

export const questionImportItemSchema = questionCreateRequestSchema;

export const questionImportRequestSchema = z.object({
  allow_new_tags: z.boolean().optional(),
  questions: z.array(questionImportItemSchema),
});

export const questionImportErrorSchema = z.object({
  index: z.number(),
  field: z.string(),
  message: z.string(),
});

export const questionImportResultSchema = z.object({
  created: z.number(),
  updated: z.number(),
  skipped: z.number(),
  errors: z.array(questionImportErrorSchema),
});
