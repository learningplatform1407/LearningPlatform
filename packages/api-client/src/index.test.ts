import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ApiClientError, createApiClient } from "./index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was never called");
  return call as [string, RequestInit];
}

describe("createApiClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function client(token: string | null = "test-token") {
    return createApiClient({ baseUrl: "http://api.test", getAccessToken: async () => token });
  }

  test("getMe sends a bearer token and parses the JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "u1", email: "a@b.com" }));

    const result = await client().getMe();

    expect(result).toEqual({ id: "u1", email: "a@b.com" });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  test("omits the Authorization header when there's no access token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await client(null).getMe();

    const [, init] = lastCall(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  test("throws ApiClientError with status and body from a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: "forbidden", message: "Admin access required" }, 403),
    );

    const error = await client()
      .listDocuments()
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 403,
      body: { code: "forbidden", message: "Admin access required" },
    });
  });

  test("listDocuments hits GET /v1/documents", async () => {
    const summaries = [{ id: "d1", title: "Lecture 1", created_at: "2026-01-01", status: "ready" }];
    fetchMock.mockResolvedValueOnce(jsonResponse(summaries));

    const result = await client().listDocuments();

    expect(result).toEqual(summaries);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/documents");
    expect(init.method ?? "GET").toBe("GET");
  });

  test("getDocument hits GET /v1/documents/{id}", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "d1" }));

    await client().getDocument("d1");

    const [url] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/documents/d1");
  });

  test("requestDocumentUploadUrl POSTs the file metadata", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ storage_path: "x.pdf", token: "tok" }));

    const result = await client().requestDocumentUploadUrl({
      filename: "lecture.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
    });

    expect(result).toEqual({ storage_path: "x.pdf", token: "tok" });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/documents/upload-url");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      filename: "lecture.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
    });
  });

  test("createDocument POSTs to /v1/documents", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "d1", title: "Lecture 1" }));

    await client().createDocument({
      title: "Lecture 1",
      storage_path: "x.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      checksum: "abc",
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/documents");
    expect(init.method).toBe("POST");
  });

  test("listAnnotations hits GET /v1/documents/{id}/annotations", async () => {
    const annotations = [{ id: "a1", type: "highlight", block_index: 0 }];
    fetchMock.mockResolvedValueOnce(jsonResponse(annotations));

    const result = await client().listAnnotations("d1");

    expect(result).toEqual(annotations);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/documents/d1/annotations");
    expect(init.method ?? "GET").toBe("GET");
  });

  test("createAnnotation POSTs to /v1/documents/{id}/annotations", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1", type: "margin_note" }));

    await client().createAnnotation("d1", {
      type: "margin_note",
      block_index: 2,
      note_text: "Check this later",
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/documents/d1/annotations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "margin_note",
      block_index: 2,
      note_text: "Check this later",
    });
  });

  test("deleteAnnotation DELETEs to /v1/documents/{id}/annotations/{annotationId}", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());

    const result = await client().deleteAnnotation("d1", "a1");

    expect(result).toBeUndefined();
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("http://api.test/v1/documents/d1/annotations/a1");
    expect(init.method).toBe("DELETE");
  });
});
