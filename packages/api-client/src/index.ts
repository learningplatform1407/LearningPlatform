import type {
  Annotation,
  AnnotationCreateRequest,
  Book,
  BookCreateRequest,
  Chapter,
  ChapterCreateRequest,
  ClozeCard,
  ClozeRating,
  ClozeReviewState,
  DocumentCreateRequest,
  DocumentResponse,
  DocumentSummaryResponse,
  EntitlementResponse,
  Flashcard,
  FlashcardCard,
  FlashcardCreateRequest,
  FlashcardImportRequest,
  FlashcardImportResult,
  FlashcardReviewState,
  FlashcardScopeFilter,
  FlashcardSummaryResponse,
  FlashcardUpdateRequest,
  QuestionImportRequest,
  QuestionImportResult,
  MeResponse,
  NotebookEntry,
  NotebookEntryCreateRequest,
  NotebookEntryUpdateRequest,
  ProfileUpdateRequest,
  Question,
  QuestionCreateRequest,
  QuestionUpdateRequest,
  RecentLesson,
  ReviewRating,
  ReviewSummaryResponse,
  SubChapter,
  SubChapterCreateRequest,
  Tag,
  UploadUrlRequest,
  UploadUrlResponse,
} from "@lp/contracts";

// Minimal quiz-session types, defined inline here rather than threaded
// through @lp/contracts/@lp/validation (QUIZ-9) — this is deliberately the
// smallest slice needed for a manual test UI, not the full shared-schema
// pass. See docs/architecture/quizzes.md §7.2 for the wire contract.
export interface QuizQuestionOption {
  id: string;
  text: string;
}

export interface QuizSessionQuestion {
  position: number;
  prompt: string;
  kind: "single" | "multi";
  scoring_scheme: string;
  points_possible: number;
  options: QuizQuestionOption[];
  selected_option_ids: string[] | null;
  answered_at: string | null;
  points_awarded: number | null;
  outcome: "correct" | "partial" | "incorrect" | null;
}

export interface QuizSession {
  id: string;
  status: "active" | "paused" | "completed" | "expired" | "cancelled";
  reveal_mode: "immediate" | "on_finish";
  question_count: number;
  duration_seconds: number | null;
  remaining_seconds: number | null;
  server_time: string;
  points_awarded: number | null;
  points_possible: number | null;
  finished_at: string | null;
  questions: QuizSessionQuestion[];
}

/**
 * Topic axis (chapters/sub-chapters/lessons) ORs together and expands to
 * lessons server-side; the tag axis ANDs. Omitting every topic field means
 * "no topic filter" — which is *not* the same as selecting every node, since
 * only the former also includes questions attached to no lesson.
 */
export interface TopicFilter {
  chapterIds?: string[];
  subChapterIds?: string[];
  documentIds?: string[];
  tagIds?: string[];
}

export interface QuizSessionCreateRequest {
  chapter_ids?: string[];
  sub_chapter_ids?: string[];
  document_ids?: string[];
  tag_ids?: string[];
  question_count: number;
  duration_seconds?: number | null;
  reveal_mode: "immediate" | "on_finish";
}

/** A graded question with its answer key revealed — no session position. */
export interface QuestionReveal {
  prompt: string;
  kind: "single" | "multi";
  points_awarded: number;
  points_possible: number;
  outcome: "correct" | "partial" | "incorrect";
  explanation: string | null;
  options: QuizOptionResult[];
}

export interface BankTreeLesson {
  id: string;
  title: string;
  question_count: number;
  answered_count: number;
  // Outcome breakdown and points over the *answered* subset only. Rates
  // (success/failure/average score) are derived from these raw counts via
  // computeBankStatsRates below, rather than sent pre-divided.
  correct_count: number;
  partial_count: number;
  incorrect_count: number;
  points_awarded: number;
  points_possible: number;
  // Lesson-completion rollup (Library's progress bars). Same shape at every
  // level of the tree — a lesson is a one-lesson subtree of itself — so
  // these are each 0 or 1 here, and the sum of children at every container
  // level above. `eligible` excludes lessons with zero published questions;
  // `completed` is success_rate >= the server's threshold.
  eligible_lesson_count: number;
  completed_lesson_count: number;
}

export interface BankTreeSubChapter extends BankTreeLesson {
  lessons: BankTreeLesson[];
}

export interface BankTreeChapter extends BankTreeLesson {
  sub_chapters: BankTreeSubChapter[];
}

export interface BankTreeBook extends BankTreeLesson {
  chapters: BankTreeChapter[];
}

export interface BankTree {
  books: BankTreeBook[];
  uncategorized_lessons: BankTreeLesson[];
  unassigned_question_count: number;
  unassigned_answered_count: number;
  unassigned_correct_count: number;
  unassigned_partial_count: number;
  unassigned_incorrect_count: number;
  unassigned_points_awarded: number;
  unassigned_points_possible: number;
}

/** The raw tally any bank node (lesson, sub-chapter, chapter, book, or the
 * unassigned bucket) carries, shared so web and mobile derive the same
 * rates from the same numbers instead of each re-deriving them. */
export interface BankStatsCounts {
  question_count: number;
  answered_count: number;
  correct_count: number;
  partial_count: number;
  incorrect_count: number;
  points_awarded: number;
  points_possible: number;
}

export interface BankStatsRates {
  pending_count: number;
  /** correct_count / answered_count — null when nothing's been answered yet,
   * distinct from a real 0% (answered everything and got it all wrong). */
  success_rate: number | null;
  /** incorrect_count / answered_count. Partial attempts count toward
   * neither rate — they're their own outcome, not halfway between the two. */
  failure_rate: number | null;
  /** points_awarded / points_possible over the answered subset. */
  average_score: number | null;
}

export function computeBankStatsRates(counts: BankStatsCounts): BankStatsRates {
  return {
    pending_count: counts.question_count - counts.answered_count,
    success_rate: counts.answered_count > 0 ? counts.correct_count / counts.answered_count : null,
    failure_rate: counts.answered_count > 0 ? counts.incorrect_count / counts.answered_count : null,
    average_score:
      counts.points_possible > 0 ? counts.points_awarded / counts.points_possible : null,
  };
}

/** Folds several nodes' counts into one, e.g. to get an "overall" figure
 * across every book, the uncategorized bucket, and the unassigned bucket. */
export function sumBankStatsCounts(nodes: BankStatsCounts[]): BankStatsCounts {
  return nodes.reduce<BankStatsCounts>(
    (total, node) => ({
      question_count: total.question_count + node.question_count,
      answered_count: total.answered_count + node.answered_count,
      correct_count: total.correct_count + node.correct_count,
      partial_count: total.partial_count + node.partial_count,
      incorrect_count: total.incorrect_count + node.incorrect_count,
      points_awarded: total.points_awarded + node.points_awarded,
      points_possible: total.points_possible + node.points_possible,
    }),
    {
      question_count: 0,
      answered_count: 0,
      correct_count: 0,
      partial_count: 0,
      incorrect_count: 0,
      points_awarded: 0,
      points_possible: 0,
    },
  );
}

/** The lesson-completion counts any bank node (lesson, sub-chapter, chapter,
 * book) carries — a lesson is 0/1 of itself, a container the sum of its
 * descendants. Shared so Library's progress bars and any future caller
 * derive the same percentage from the same numbers. */
export interface LessonCompletionCounts {
  eligible_lesson_count: number;
  completed_lesson_count: number;
}

/** completed / eligible as a 0–100 percentage, or null when nothing in this
 * subtree is eligible — same null-for-empty contract as
 * computeBankStatsRates, so every caller renders "nothing to show" the
 * same way instead of a divide-by-zero or a misleading 0%. */
export function computeLessonCompletionPercent(counts: LessonCompletionCounts): number | null {
  if (counts.eligible_lesson_count === 0) return null;
  return (counts.completed_lesson_count / counts.eligible_lesson_count) * 100;
}

export interface QuizAnswerSaved {
  saved: true;
}

export interface QuizOptionResult {
  id: string;
  text: string;
  in_key: boolean;
  selected: boolean;
  classified_correctly: boolean;
  rationale: string | null;
}

export interface QuizQuestionResult {
  position: number;
  prompt: string;
  kind: "single" | "multi";
  points_awarded: number;
  points_possible: number;
  outcome: "correct" | "partial" | "incorrect";
  explanation: string | null;
  options: QuizOptionResult[];
}

export interface QuizSessionResults {
  id: string;
  status: "completed" | "expired" | "cancelled";
  reveal_mode: "immediate" | "on_finish";
  points_awarded: number | null;
  points_possible: number | null;
  finished_at: string | null;
  questions: QuizQuestionResult[];
}

export interface QuizSessionHistoryItem {
  id: string;
  status: "active" | "paused" | "completed" | "expired" | "cancelled";
  reveal_mode: "immediate" | "on_finish";
  question_count: number;
  points_awarded: number | null;
  points_possible: number | null;
  finished_at: string | null;
  created_at: string;
}

export interface QuizAvailableCount {
  available: number;
}

export interface QuestionBankTag {
  id: string;
  slug: string;
  label: string;
}

/** The caller's own standing on one question — latest attempt only. */
export interface QuestionProgress {
  outcome: "correct" | "partial" | "incorrect";
  points_awarded: number;
  points_possible: number;
  attempt_count: number;
  last_answered_at: string;
}

/** Student-facing view of a bank question: no answer key, by design. */
export interface QuestionBankItem {
  id: string;
  prompt: string;
  kind: "single" | "multi";
  difficulty: "easy" | "medium" | "hard";
  points_possible: number;
  document_id: string | null;
  options: QuizQuestionOption[];
  tags: QuestionBankTag[];
  /** `null` when never attempted — distinct from attempted and scoring zero. */
  progress: QuestionProgress | null;
}

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
}

export class ApiClientError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

/** Repeated query params, the shape FastAPI expects for list[UUID]. */
function topicParams(filter?: TopicFilter): URLSearchParams {
  const query = new URLSearchParams();
  for (const id of filter?.chapterIds ?? []) query.append("chapter_ids", id);
  for (const id of filter?.subChapterIds ?? []) query.append("sub_chapter_ids", id);
  for (const id of filter?.documentIds ?? []) query.append("document_ids", id);
  for (const id of filter?.tagIds ?? []) query.append("tag_ids", id);
  return query;
}

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await config.getAccessToken();
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiClientError(response.status, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    getMe: () => request<MeResponse>("/v1/me"),
    updateMe: (data: ProfileUpdateRequest) =>
      request<MeResponse>("/v1/me", { method: "PATCH", body: JSON.stringify(data) }),
    getMyEntitlements: () => request<EntitlementResponse[]>("/v1/me/entitlements"),
    listDocuments: (subChapterId?: string) =>
      request<DocumentSummaryResponse[]>(
        subChapterId
          ? `/v1/documents?sub_chapter_id=${encodeURIComponent(subChapterId)}`
          : "/v1/documents",
      ),
    getDocument: (id: string) => request<DocumentResponse>(`/v1/documents/${id}`),
    requestDocumentUploadUrl: (data: UploadUrlRequest) =>
      request<UploadUrlResponse>("/v1/documents/upload-url", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    createDocument: (data: DocumentCreateRequest) =>
      request<DocumentResponse>("/v1/documents", { method: "POST", body: JSON.stringify(data) }),
    listAnnotations: (documentId: string) =>
      request<Annotation[]>(`/v1/documents/${documentId}/annotations`),
    createAnnotation: (documentId: string, data: AnnotationCreateRequest) =>
      request<Annotation>(`/v1/documents/${documentId}/annotations`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deleteAnnotation: (documentId: string, annotationId: string) =>
      request<void>(`/v1/documents/${documentId}/annotations/${annotationId}`, {
        method: "DELETE",
      }),
    listBooks: () => request<Book[]>("/v1/books"),
    createBook: (data: BookCreateRequest) =>
      request<Book>("/v1/books", { method: "POST", body: JSON.stringify(data) }),
    listChapters: (bookId: string) => request<Chapter[]>(`/v1/books/${bookId}/chapters`),
    createChapter: (bookId: string, data: ChapterCreateRequest) =>
      request<Chapter>(`/v1/books/${bookId}/chapters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listRecentLessons: (limit?: number) =>
      request<RecentLesson[]>(`/v1/me/recent-lessons${limit ? `?limit=${limit}` : ""}`),
    getReviewSummary: () => request<ReviewSummaryResponse>("/v1/me/review-summary"),
    listSubChapters: (chapterId: string) =>
      request<SubChapter[]>(`/v1/chapters/${chapterId}/sub-chapters`),
    createSubChapter: (chapterId: string, data: SubChapterCreateRequest) =>
      request<SubChapter>(`/v1/chapters/${chapterId}/sub-chapters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listQuestions: (params?: {
      status?: string;
      tagId?: string;
      documentId?: string;
      limit?: number;
      offset?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.tagId) query.set("tag_id", params.tagId);
      if (params?.documentId) query.set("document_id", params.documentId);
      if (params?.limit !== undefined) query.set("limit", String(params.limit));
      if (params?.offset !== undefined) query.set("offset", String(params.offset));
      const qs = query.toString();
      return request<Question[]>(`/v1/questions${qs ? `?${qs}` : ""}`);
    },
    createQuestion: (data: QuestionCreateRequest) =>
      request<Question>("/v1/questions", { method: "POST", body: JSON.stringify(data) }),
    getQuestion: (id: string) => request<Question>(`/v1/questions/${id}`),
    updateQuestion: (id: string, data: QuestionUpdateRequest) =>
      request<Question>(`/v1/questions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    archiveQuestion: (id: string) => request<Question>(`/v1/questions/${id}`, { method: "DELETE" }),
    importQuestions: (data: QuestionImportRequest, dryRun = false) =>
      request<QuestionImportResult>(`/v1/questions/import${dryRun ? "?dry_run=true" : ""}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listTags: () => request<Tag[]>("/v1/tags"),
    listQuestionBank: (
      params?: TopicFilter & { unassigned?: boolean; limit?: number; offset?: number },
    ) => {
      const query = topicParams(params);
      if (params?.unassigned) query.set("unassigned", "true");
      if (params?.limit !== undefined) query.set("limit", String(params.limit));
      if (params?.offset !== undefined) query.set("offset", String(params.offset));
      const qs = query.toString();
      return request<QuestionBankItem[]>(`/v1/question-bank${qs ? `?${qs}` : ""}`);
    },
    getQuestionBankTree: () => request<BankTree>("/v1/question-bank/tree"),
    answerBankQuestion: (questionId: string, selectedOptionIds: string[]) =>
      request<QuestionReveal>(`/v1/question-bank/${questionId}/answers`, {
        method: "POST",
        body: JSON.stringify({ selected_option_ids: selectedOptionIds }),
      }),
    getCurrentQuizSession: () => request<QuizSession | null>("/v1/quiz-sessions/current"),
    listQuizSessionHistory: () => request<QuizSessionHistoryItem[]>("/v1/quiz-sessions"),
    getQuizAvailableCount: (params?: TopicFilter) => {
      const qs = topicParams(params).toString();
      return request<QuizAvailableCount>(`/v1/quiz-sessions/available-count${qs ? `?${qs}` : ""}`);
    },
    startQuizSession: (data: QuizSessionCreateRequest) =>
      request<QuizSession>("/v1/quiz-sessions", { method: "POST", body: JSON.stringify(data) }),
    getQuizSession: (id: string) => request<QuizSession>(`/v1/quiz-sessions/${id}`),
    answerQuizQuestion: (id: string, position: number, selectedOptionIds: string[]) =>
      request<QuizAnswerSaved | QuizQuestionResult>(`/v1/quiz-sessions/${id}/answers/${position}`, {
        method: "PUT",
        body: JSON.stringify({ selected_option_ids: selectedOptionIds }),
      }),
    pauseQuizSession: (id: string) =>
      request<QuizSession>(`/v1/quiz-sessions/${id}/pause`, { method: "POST" }),
    resumeQuizSession: (id: string) =>
      request<QuizSession>(`/v1/quiz-sessions/${id}/resume`, { method: "POST" }),
    cancelQuizSession: (id: string) =>
      request<QuizSession>(`/v1/quiz-sessions/${id}/cancel`, { method: "POST" }),
    submitQuizSession: (id: string) =>
      request<QuizSession>(`/v1/quiz-sessions/${id}/submit`, { method: "POST" }),
    getQuizResults: (id: string) => request<QuizSessionResults>(`/v1/quiz-sessions/${id}/results`),
    listFlashcards: (documentId: string, scope?: FlashcardScopeFilter) =>
      request<Flashcard[]>(
        `/v1/documents/${documentId}/flashcards${scope ? `?scope=${scope}` : ""}`,
      ),
    listDueFlashcards: (
      documentId: string,
      params?: { scope?: FlashcardScopeFilter; limit?: number },
    ) => {
      const query = new URLSearchParams();
      if (params?.scope) query.set("scope", params.scope);
      if (params?.limit !== undefined) query.set("limit", String(params.limit));
      const suffix = query.toString() ? `?${query}` : "";
      return request<FlashcardCard[]>(`/v1/documents/${documentId}/flashcards/due${suffix}`);
    },
    createFlashcard: (documentId: string, data: FlashcardCreateRequest) =>
      request<Flashcard>(`/v1/documents/${documentId}/flashcards`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateFlashcard: (flashcardId: string, data: FlashcardUpdateRequest) =>
      request<Flashcard>(`/v1/flashcards/${flashcardId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteFlashcard: (flashcardId: string) =>
      request<void>(`/v1/flashcards/${flashcardId}`, { method: "DELETE" }),
    submitFlashcardReview: (flashcardId: string, rating: ReviewRating) =>
      request<FlashcardReviewState>(`/v1/flashcards/${flashcardId}/review`, {
        method: "POST",
        body: JSON.stringify({ rating }),
      }),
    /** Takes a card out of the caller's rotation, or puts it back. PUT with a
     * field rather than a toggle, so retrying is harmless. */
    setFlashcardSuspension: (flashcardId: string, suspended: boolean) =>
      request<FlashcardReviewState>(`/v1/flashcards/${flashcardId}/suspension`, {
        method: "PUT",
        body: JSON.stringify({ suspended }),
      }),
    getFlashcardSummary: () => request<FlashcardSummaryResponse>("/v1/me/flashcard-summary"),
    importFlashcards: (data: FlashcardImportRequest, dryRun: boolean) =>
      request<FlashcardImportResult>(`/v1/flashcards/import?dry_run=${dryRun}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listClozeCards: (documentId: string) =>
      request<ClozeCard[]>(`/v1/documents/${documentId}/cloze-cards`),
    listDueClozeCards: (documentId: string) =>
      request<ClozeCard[]>(`/v1/documents/${documentId}/cloze-cards/due`),
    submitClozeReview: (documentId: string, clozeCardId: string, rating: ClozeRating) =>
      request<ClozeReviewState>(`/v1/documents/${documentId}/cloze-cards/${clozeCardId}/review`, {
        method: "POST",
        body: JSON.stringify({ rating }),
      }),
    listNotebookEntries: () => request<NotebookEntry[]>("/v1/notebook-entries"),
    createNotebookEntry: (data: NotebookEntryCreateRequest) =>
      request<NotebookEntry>("/v1/notebook-entries", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateNotebookEntry: (id: string, data: NotebookEntryUpdateRequest) =>
      request<NotebookEntry>(`/v1/notebook-entries/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteNotebookEntry: (id: string) =>
      request<void>(`/v1/notebook-entries/${id}`, { method: "DELETE" }),
  };
}
