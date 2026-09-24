import type {
  Annotation,
  AnnotationCreateRequest,
  Book,
  BookCreateRequest,
  Chapter,
  ChapterCreateRequest,
  DocumentCreateRequest,
  DocumentResponse,
  DocumentSummaryResponse,
  EntitlementResponse,
  Flashcard,
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
  Quiz,
  RecentLesson,
  SubChapter,
  SubChapterCreateRequest,
  Tag,
  UploadUrlRequest,
  UploadUrlResponse,
} from "@lp/contracts";

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
    listSubChapters: (chapterId: string) =>
      request<SubChapter[]>(`/v1/chapters/${chapterId}/sub-chapters`),
    createSubChapter: (chapterId: string, data: SubChapterCreateRequest) =>
      request<SubChapter>(`/v1/chapters/${chapterId}/sub-chapters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listQuizzes: (documentId: string) => request<Quiz[]>(`/v1/documents/${documentId}/quizzes`),
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
    listFlashcards: (documentId: string) =>
      request<Flashcard[]>(`/v1/documents/${documentId}/flashcards`),
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
