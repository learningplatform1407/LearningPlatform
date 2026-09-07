import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import LecturesPage from "./page";

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
const listDocuments = vi.fn();
const requestDocumentUploadUrl = vi.fn();
const createDocument = vi.fn();
const uploadToSignedUrl = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LecturesPage />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

beforeEach(() => {
  getMe.mockReset();
  listDocuments.mockReset();
  requestDocumentUploadUrl.mockReset();
  createDocument.mockReset();
  uploadToSignedUrl.mockReset();
});

describe("LecturesPage", () => {
  test("renders the document list once loaded", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Intro to Systems", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();

    expect(await screen.findByText("Intro to Systems")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  test("shows an empty state when there are no documents", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No lectures uploaded yet.")).toBeInTheDocument();
  });

  test("hides the upload form for a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([]);

    renderPage();

    await screen.findByText("No lectures uploaded yet.");
    expect(screen.queryByText("Upload a lecture")).not.toBeInTheDocument();
  });

  test("shows the upload form for an admin", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listDocuments.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("Upload a lecture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  test("uploading a PDF goes through requestUploadUrl -> storage -> createDocument", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listDocuments.mockResolvedValue([]);
    requestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    createDocument.mockResolvedValue({ id: "d1", title: "New Lecture" });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Upload a lecture");
    await user.type(screen.getByLabelText("Title"), "New Lecture");

    const file = new File(["%PDF-1.4"], "lecture.pdf", { type: "application/pdf" });
    selectFile(screen.getByLabelText("PDF file"), file);

    submitForm(screen.getByLabelText("PDF file"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    expect(requestDocumentUploadUrl).toHaveBeenCalledWith({
      filename: "lecture.pdf",
      mime_type: "application/pdf",
      size_bytes: file.size,
    });
    expect(uploadToSignedUrl).toHaveBeenCalledWith("abc.pdf", "tok", file, {
      contentType: "application/pdf",
    });
    const createCall = createDocument.mock.calls[0]![0];
    expect(createCall.title).toBe("New Lecture");
    expect(createCall.storage_path).toBe("abc.pdf");
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

    await screen.findByText("Upload a lecture");
    await user.type(screen.getByLabelText("Title"), "New Lecture");
    selectFile(
      screen.getByLabelText("PDF file"),
      new File(["%PDF-1.4"], "lecture.pdf", { type: "application/pdf" }),
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

    await screen.findByText("Upload a lecture");
    await user.type(screen.getByLabelText("Title"), "New Lecture");
    selectFile(
      screen.getByLabelText("PDF file"),
      new File(["not a pdf"], "notes.txt", { type: "text/plain" }),
    );
    submitForm(screen.getByLabelText("PDF file"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF files are supported.");
    expect(requestDocumentUploadUrl).not.toHaveBeenCalled();
  });
});

test("status labels render for each document status", async () => {
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
