import type {
  Annotation,
  AnnotationCreateRequest,
  Chapter,
  ChapterCreateRequest,
  DocumentCreateRequest,
  DocumentResponse,
  DocumentSummaryResponse,
  EntitlementResponse,
  Flashcard,
  MeResponse,
  Note,
  ProfileUpdateRequest,
  Quiz,
  RecentLesson,
  SubChapter,
  SubChapterCreateRequest,
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
    listChapters: () => request<Chapter[]>("/v1/chapters"),
    createChapter: (data: ChapterCreateRequest) =>
      request<Chapter>("/v1/chapters", { method: "POST", body: JSON.stringify(data) }),
    listRecentLessons: (limit?: number) =>
      request<RecentLesson[]>(`/v1/me/recent-lessons${limit ? `?limit=${limit}` : ""}`),
    listSubChapters: (chapterId: string) =>
      request<SubChapter[]>(`/v1/chapters/${chapterId}/sub-chapters`),
    createSubChapter: (chapterId: string, data: SubChapterCreateRequest) =>
      request<SubChapter>(`/v1/chapters/${chapterId}/sub-chapters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getNote: (documentId: string) => request<Note | null>(`/v1/documents/${documentId}/notes`),
    upsertNote: (documentId: string, content: string) =>
      request<Note>(`/v1/documents/${documentId}/notes`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    listQuizzes: (documentId: string) => request<Quiz[]>(`/v1/documents/${documentId}/quizzes`),
    listFlashcards: (documentId: string) =>
      request<Flashcard[]>(`/v1/documents/${documentId}/flashcards`),
  };
}
