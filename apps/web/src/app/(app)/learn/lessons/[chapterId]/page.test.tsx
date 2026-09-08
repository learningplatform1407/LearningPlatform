import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import ChapterLessonsPage from "./page";

// userEvent.upload() silently no-ops on file inputs in this project's jsdom
// setup (files.length stays 0 with no error) — fireEvent.change with an
// explicit FileList-like `files` array is the reliable way to simulate a
// file pick here.
function selectFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

// jsdom doesn't recognize a file input's `files` as satisfying `required`
// when set this way (`validity.valueMissing` stays true even with a real
// file present), which blocks a real button .click() before our onSubmit
// ever runs — a jsdom-only gap, not something real browsers do. Submitting
// the form directly sidesteps that gap; the button itself is still exercised
// by "shows the upload form for an admin" above.
function submitForm(container: HTMLElement) {
  fireEvent.submit(container.closest("form")!);
}

const getMe = vi.fn();
const listChapters = vi.fn();
const listDocuments = vi.fn();
const requestDocumentUploadUrl = vi.fn();
const createDocument = vi.fn();
const uploadToSignedUrl = vi.fn();

let mockChapterId = "c1";

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    listChapters,
    listDocuments,
    requestDocumentUploadUrl,
    createDocument,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl }) },
  }),
}));

// jsdom's File polyfill doesn't implement arrayBuffer() (see checksum.test.ts,
// which covers the real hashing logic under Node's environment instead) — this
// file only needs to verify a checksum gets computed and passed through.
vi.mock("@/lib/checksum", () => ({
  sha256Hex: vi.fn().mockResolvedValue("a".repeat(64)),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ chapterId: mockChapterId }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChapterLessonsPage />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };
const CHAPTERS = [{ id: "c1", title: "Intro to Systems", order_index: 0, lesson_count: 1 }];

beforeEach(() => {
  mockChapterId = "c1";
  getMe.mockReset();
  listChapters.mockReset().mockResolvedValue(CHAPTERS);
  listDocuments.mockReset();
  requestDocumentUploadUrl.mockReset();
  createDocument.mockReset();
  uploadToSignedUrl.mockReset();
});

describe("ChapterLessonsPage", () => {
  test("renders the chapter title and its lesson list once loaded", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Intro to Systems" })).toBeInTheDocument();
    expect(screen.getByText("Lesson 1")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledWith("c1");
  });

  test("shows an empty state when there are no lessons", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No lessons yet.")).toBeInTheDocument();
  });

  test("hides the upload form for a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([]);

    renderPage();

    await screen.findByText("No lessons yet.");
    expect(screen.queryByText("Upload a lesson")).not.toBeInTheDocument();
  });

  test("shows the upload form for an admin", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listDocuments.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("Upload a lesson")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  test("uploading a PDF goes through requestUploadUrl -> storage -> createDocument, tagged with the chapter", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listDocuments.mockResolvedValue([]);
    requestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    createDocument.mockResolvedValue({ id: "d1", title: "New Lesson" });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Upload a lesson");
    await user.type(screen.getByLabelText("Title"), "New Lesson");

    const file = new File(["%PDF-1.4"], "lesson.pdf", { type: "application/pdf" });
    selectFile(screen.getByLabelText("PDF file"), file);

    submitForm(screen.getByLabelText("PDF file"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    expect(requestDocumentUploadUrl).toHaveBeenCalledWith({
      filename: "lesson.pdf",
      mime_type: "application/pdf",
      size_bytes: file.size,
    });
    expect(uploadToSignedUrl).toHaveBeenCalledWith("abc.pdf", "tok", file, {
      contentType: "application/pdf",
    });
    const createCall = createDocument.mock.calls[0]![0];
    expect(createCall.title).toBe("New Lesson");
    expect(createCall.storage_path).toBe("abc.pdf");
    expect(createCall.chapter_id).toBe("c1");
    expect(typeof createCall.checksum).toBe("string");
    expect(createCall.checksum.length).toBe(64);
  });

  test("shows an error if the storage upload fails", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listDocuments.mockResolvedValue([]);
    requestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    uploadToSignedUrl.mockResolvedValue({ data: null, error: new Error("network blip") });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Upload a lesson");
    await user.type(screen.getByLabelText("Title"), "New Lesson");
    selectFile(
      screen.getByLabelText("PDF file"),
      new File(["%PDF-1.4"], "lesson.pdf", { type: "application/pdf" }),
    );
    submitForm(screen.getByLabelText("PDF file"));

    expect(await screen.findByRole("alert")).toHaveTextContent("network blip");
    expect(createDocument).not.toHaveBeenCalled();
  });

  test("rejects a non-PDF file before calling the API", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listDocuments.mockResolvedValue([]);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Upload a lesson");
    await user.type(screen.getByLabelText("Title"), "New Lesson");
    selectFile(
      screen.getByLabelText("PDF file"),
      new File(["not a pdf"], "notes.txt", { type: "text/plain" }),
    );
    submitForm(screen.getByLabelText("PDF file"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF files are supported.");
    expect(requestDocumentUploadUrl).not.toHaveBeenCalled();
  });

  test("the Uncategorized bucket lists chapterless lessons and uploads without a chapter_id", async () => {
    mockChapterId = "uncategorized";
    getMe.mockResolvedValue(ADMIN_ME);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);
    requestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    createDocument.mockResolvedValue({ id: "d2", title: "Another loose lesson" });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Uncategorized" })).toBeInTheDocument();
    expect(screen.getByText("Loose lesson")).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledWith("none");
    expect(listChapters).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Title"), "Another loose lesson");
    selectFile(
      screen.getByLabelText("PDF file"),
      new File(["%PDF-1.4"], "lesson.pdf", { type: "application/pdf" }),
    );
    submitForm(screen.getByLabelText("PDF file"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    expect(createDocument.mock.calls[0]![0].chapter_id).toBeUndefined();
  });
});

test("status labels render for each lesson status", async () => {
  getMe.mockResolvedValue(STUDENT_ME);
  listDocuments.mockResolvedValue([
    { id: "d1", title: "A", created_at: "2026-01-01", status: "processing" },
    { id: "d2", title: "B", created_at: "2026-01-01", status: "failed" },
  ]);

  renderPage();

  const listA = await screen.findByText("A");
  expect(within(listA.closest("a")!).getByText("Processing...")).toBeInTheDocument();
  const listB = screen.getByText("B");
  expect(within(listB.closest("a")!).getByText("Failed")).toBeInTheDocument();
});
