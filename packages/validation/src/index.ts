import { z } from "zod";

export const accountSettingsSchema = z.object({
  theme: z.string(),
  notifications_enabled: z.boolean(),
  language: z.string(),
  profile_public: z.boolean(),
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
  // The languages the apps ship catalogues for; the API refuses others.
  language: z.enum(["en", "ro"]).optional(),
  // Refused (422 display_name_required) without a display name.
  profile_public: z.boolean().optional(),
});

export const profileStatsResponseSchema = z.object({
  current_streak_days: z.number(),
  longest_streak_days: z.number(),
  lessons_completed: z.number(),
  lessons_eligible: z.number(),
  exams_completed: z.number(),
  exam_average_score_percent: z.number().nullable(),
  questions_attempted: z.number(),
  questions_answered_lifetime: z.number(),
  question_accuracy_percent: z.number().nullable(),
});

/** Another learner, as a search result or a follow-list row. The flags are
 * from the caller's point of view. */
export const userSummarySchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  university: z.string().nullable(),
  is_following: z.boolean(),
  follows_you: z.boolean(),
});

export const publicProfileResponseSchema = userSummarySchema.extend({
  created_at: z.string(),
  followers_count: z.number(),
  following_count: z.number(),
  stats: profileStatsResponseSchema,
});

/** One line of the activity feed. Flat: each kind fills its own fields and
 * leaves the rest null; the clients build the sentence from `kind`. */
const activityActorSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const activityEventSchema = z.object({
  id: z.string(),
  kind: z.enum(["exam_completed", "lesson_completed", "streak_milestone", "challenge_completed"]),
  created_at: z.string(),
  user: activityActorSchema,
  document_id: z.string().nullable(),
  document_title: z.string().nullable(),
  score_percent: z.number().nullable(),
  question_count: z.number().nullable(),
  streak_days: z.number().nullable(),
  // challenge_completed; `score_percent` is the author's own.
  opponent: activityActorSchema.nullable(),
  opponent_score_percent: z.number().nullable(),
});

export const challengeCreateRequestSchema = z.object({
  session_id: z.string(),
  user_id: z.string(),
});

/** A challenge from the caller's side. The opponent's score and the
 * per-question comparison stay null until both have finished. */
export const challengeResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "accepted", "completed", "declined", "expired"]),
  direction: z.enum(["incoming", "sent"]),
  opponent: activityActorSchema,
  question_count: z.number(),
  duration_seconds: z.number().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  completed_at: z.string().nullable(),
  your_session_id: z.string().nullable(),
  your_score_percent: z.number().nullable(),
  opponent_score_percent: z.number().nullable(),
  questions: z
    .array(
      z.object({
        position: z.number(),
        your_outcome: z.string().nullable(),
        opponent_outcome: z.string().nullable(),
      }),
    )
    .nullable(),
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

export const lecturePdfStatusSchema = z.enum(["processing", "ready", "failed"]);

/** `storage_path` is what the client resolves to a signed URL and hands to
 * pdf.js (web) or react-native-pdf (mobile) -- the backend never
 * text-extracts or rasterizes this artifact. */
export const lecturePdfResponseSchema = z.object({
  status: lecturePdfStatusSchema,
  error_message: z.string().nullable(),
  storage_path: z.string(),
  /** Counted server-side at upload. Bounds which page may carry ink, and
   * lets a client label "page 1 of N" before the PDF has downloaded. */
  page_count: z.number(),
});

export const documentResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  current_version: documentVersionResponseSchema.nullable(),
  sub_chapter: subChapterSummarySchema.nullable().optional(),
  /** null means this lesson has no reference PDF attached -- hide the
   * PDF/Text toggle entirely in that case. */
  lecture_pdf: lecturePdfResponseSchema.nullable().optional(),
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

/** Replaces a lesson's lecture text -- highlights/margin-notes on unchanged
 * text blocks carry forward; flashcards/cloze/question-bank questions are
 * untouched. */
export const replaceLectureTextRequestSchema = z.object({
  storage_path: z.string(),
  mime_type: z.literal("application/pdf"),
  size_bytes: z.number(),
  checksum: z.string(),
});

/** Attaches or replaces a lesson's reference-book PDF. Always a full
 * wipe-and-recreate -- no matching, drops all ink on this lesson
 * unconditionally. */
export const upsertLecturePdfRequestSchema = z.object({
  storage_path: z.string(),
  mime_type: z.literal("application/pdf"),
  size_bytes: z.number(),
  checksum: z.string(),
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
  /** Computed server-side. `is_mine` is deliberately NOT the test: an admin
   * who imported an official card created it, so is_mine is true, but
   * official cards are not editable. */
  can_edit: z.boolean(),
  can_delete: z.boolean(),
});

/** A card as the deck runner receives it. Carries `back_text` up front:
 * unlike a question, a flashcard's back is not an answer key, so the reveal
 * needs no second request and the client simply holds it until tapped. */
/** Days each grade would schedule a card for, if chosen now. */
export const nextIntervalsSchema = z.object({
  again: z.number(),
  hard: z.number(),
  good: z.number(),
  easy: z.number(),
});

export const flashcardCardSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  front_text: z.string(),
  back_text: z.string(),
  scope: flashcardScopeSchema,
  is_mine: z.boolean(),
  due_at: z.string().nullable(),
  is_new: z.boolean(),
  next_intervals: nextIntervalsSchema,
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

export const clozeDueCardResponseSchema = clozeCardResponseSchema.extend({
  next_intervals: nextIntervalsSchema,
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

/** PATCH body: only the fields sent change. */
export const annotationUpdateRequestSchema = z.object({
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

/** One user's freehand ink on one page of a lesson's lecture PDF. A PUT
 * replaces the whole array, same convention as notebook drawings. */
const pageUnitSchema = z.number().min(0).max(1);

/** A word highlight on a PDF page: one rectangle per run of words on a
 * line, each [x0, y0, x1, y1] as fractions of the page's size. */
export const pageHighlightSchema = z.object({
  color: z.string(),
  rects: z.array(z.tuple([pageUnitSchema, pageUnitSchema, pageUnitSchema, pageUnitSchema])).min(1),
});

export const lessonPageInkResponseSchema = z.object({
  strokes: z.array(strokeSchema),
  highlights: z.array(pageHighlightSchema),
});

export const lessonPageInkUpdateRequestSchema = z.object({
  strokes: z.array(strokeSchema),
  /** Omit to leave the page's highlights as they are (a strokes-only save). */
  highlights: z.array(pageHighlightSchema).optional(),
});

/** The words on a PDF page with their boxes ([x0, y0, x1, y1] in page
 * units), for clients whose PDF view exposes no text (mobile). `line`
 * groups the words of one printed line. */
export const pageWordsResponseSchema = z.object({
  words: z.array(
    z.object({
      text: z.string(),
      box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      line: z.number().int(),
    }),
  ),
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
  source_quotes: z.array(z.string()),
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
  /** Lesson sentences behind the options, quoted verbatim (See in lesson). */
  source_quotes: z.array(z.string()).max(10).optional(),
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
  /** Lesson sentences behind the options, quoted verbatim (See in lesson). */
  source_quotes: z.array(z.string()).max(10).optional(),
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

/** `news` is an announcement that stands on its own; `media` is one carrying
 * a livestream, Instagram or other social URL in its body. Narrower than the
 * original FEED epic's news/exam/livestream: there is no separate link field,
 * because a URL belongs in the text the author is already writing, and an
 * *embedded* player is deliberately out of scope. */
export const feedCategorySchema = z.enum(["news", "media"]);

export const feedAuthorSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const feedPostResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: feedCategorySchema,
  /** A storage key in the public `feed-images` bucket, not a URL — resolve it
   * with `getPublicUrl()`, which is a synchronous string concat. Deliberately
   * unlike `profiles.avatar_url`, which stores a full URL because the client
   * builds it there. See docs/architecture/feed.md. */
  image_path: z.string().nullable(),
  /** Null once the authoring admin's profile is deleted: `author_id` is SET
   * NULL, so the announcement outlives its author. A normal state, not an
   * error — both clients fall back to a generic byline. */
  author: feedAuthorSchema.nullable(),
  published_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Computed server-side and, unlike the flashcard fields of the same name,
   * role-based rather than ownership-based: any admin may edit or delete any
   * post. Gate the buttons on these, never on the caller's own role — that
   * re-derivation is the bug ad08d02 fixed. */
  can_edit: z.boolean(),
  can_delete: z.boolean(),
});

export const feedPostCreateRequestSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: feedCategorySchema,
  image_path: z.string().nullable().optional(),
});

/** Every field optional, and `image_path: null` is meaningful — it clears the
 * picture, which the server distinguishes from omitting the field. `title` and
 * `body` keep min(1) so an edit cannot blank them. */
export const feedPostUpdateRequestSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  category: feedCategorySchema.optional(),
  image_path: z.string().nullable().optional(),
});

export const feedImageUploadUrlRequestSchema = z.object({
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size_bytes: z.number(),
});

export const feedImageUploadUrlResponseSchema = z.object({
  storage_path: z.string(),
  token: z.string(),
});
