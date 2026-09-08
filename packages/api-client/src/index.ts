import type {
  Annotation,
  AnnotationCreateRequest,
  Chapter,
  ChapterCreateRequest,
  DocumentCreateRequest,
  DocumentResponse,
  DocumentSummaryResponse,
  EntitlementResponse,
  MeResponse,
  ProfileUpdateRequest,
  RecentLesson,
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
    listDocuments: (chapterId?: string) =>
      request<DocumentSummaryResponse[]>(
        chapterId ? `/v1/documents?chapter_id=${encodeURIComponent(chapterId)}` : "/v1/documents",
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
  };
}
