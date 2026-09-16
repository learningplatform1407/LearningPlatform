import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import BookPage from "./page";

function selectFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

function submitForm(container: HTMLElement) {
  fireEvent.submit(container.closest("form")!);
}

const getMe = vi.fn();
const listChapters = vi.fn();
const createChapter = vi.fn();
const listDocuments = vi.fn();
const requestDocumentUploadUrl = vi.fn();
const createDocument = vi.fn();
const uploadToSignedUrl = vi.fn();

let mockBookId = "b1";

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    listChapters,
    createChapter,
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

vi.mock("@/lib/checksum", () => ({
  sha256Hex: vi.fn().mockResolvedValue("a".repeat(64)),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ bookId: mockBookId }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookPage />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

beforeEach(() => {
  mockBookId = "b1";
  getMe.mockReset();
  listChapters.mockReset().mockResolvedValue([]);
  createChapter.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
  requestDocumentUploadUrl.mockReset();
  createDocument.mockReset();
  uploadToSignedUrl.mockReset();
});

describe("BookPage (real book)", () => {
  test("renders chapters for the book, scoped by book id", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listChapters.mockResolvedValue([
      { id: "c1", book_id: "b1", title: "Intro to Systems", order_index: 0, sub_chapter_count: 2 },
    ]);

    renderPage();

    expect(await screen.findByText("Intro to Systems")).toBeInTheDocument();
    expect(screen.getByText("2 sub-chapters")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Intro to Systems/ })).toHaveAttribute(
      "href",
      "/learn/library/b1/c1",
    );
    expect(listChapters).toHaveBeenCalledWith("b1");
  });

  test("shows an empty state when the book has no chapters", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();

    expect(await screen.findByText("No chapters yet.")).toBeInTheDocument();
  });

  test("hides the new-chapter form for a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();

    await screen.findByText("No chapters yet.");
    expect(screen.queryByText("New chapter")).not.toBeInTheDocument();
  });

  test("an admin can create a new chapter scoped to this book", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    createChapter.mockResolvedValue({
      id: "c1",
      book_id: "b1",
      title: "New Chapter",
      order_index: 0,
      sub_chapter_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("New chapter");
    await user.type(screen.getByLabelText("Title"), "New Chapter");
    fireEvent.submit(screen.getByLabelText("Title").closest("form")!);

    await waitFor(() =>
      expect(createChapter).toHaveBeenCalledWith("b1", { title: "New Chapter" }),
    );
  });
});

describe("BookPage (Uncategorized)", () => {
  beforeEach(() => {
    mockBookId = "uncategorized";
  });

  test("lists chapterless lessons directly, no book/chapter fetch, and uploads without a sub_chapter_id", async () => {
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
    expect(await screen.findByText("Loose lesson")).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledWith("none");
    expect(listChapters).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Title"), "Another loose lesson");
    selectFile(
      screen.getByLabelText("PDF file"),
      new File(["%PDF-1.4"], "lesson.pdf", { type: "application/pdf" }),
    );
    submitForm(screen.getByLabelText("PDF file"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    expect(createDocument.mock.calls[0]![0].sub_chapter_id).toBeUndefined();
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
});
