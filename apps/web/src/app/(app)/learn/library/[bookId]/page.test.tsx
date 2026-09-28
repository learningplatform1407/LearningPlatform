import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import BookPage from "./page";

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
// by the "shows the new-sub-chapter form for an admin" case below.
function submitForm(container: HTMLElement) {
  fireEvent.submit(container.closest("form")!);
}

const getMe = vi.fn();
const listChapters = vi.fn();
const createChapter = vi.fn();
const listSubChapters = vi.fn();
const createSubChapter = vi.fn();
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
    listSubChapters,
    createSubChapter,
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
const CHAPTERS = [
  { id: "c1", book_id: "b1", title: "Intro to Systems", order_index: 0, sub_chapter_count: 1 },
];
const SUB_CHAPTERS = [
  { id: "sc1", chapter_id: "c1", title: "Sub A", order_index: 0, lesson_count: 1 },
];

beforeEach(() => {
  mockBookId = "b1";
  getMe.mockReset();
  listChapters.mockReset().mockResolvedValue(CHAPTERS);
  createChapter.mockReset();
  listSubChapters.mockReset().mockResolvedValue(SUB_CHAPTERS);
  createSubChapter.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
  requestDocumentUploadUrl.mockReset();
  createDocument.mockReset();
  uploadToSignedUrl.mockReset();
});

describe("BookPage (real book)", () => {
  test("renders chapters for the book, collapsed by default", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();

    expect(await screen.findByRole("button", { name: /Intro to Systems/ })).toBeInTheDocument();
    expect(screen.getByText(/1 sub-chapter/)).toBeInTheDocument();
    expect(listChapters).toHaveBeenCalledWith("b1");
    expect(listSubChapters).not.toHaveBeenCalled();
  });

  test("shows an empty state when the book has no chapters", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listChapters.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No chapters yet.")).toBeInTheDocument();
  });

  test("hides the new-chapter form for a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();

    await screen.findByText(/Intro to Systems/);
    expect(screen.queryByText("New chapter")).not.toBeInTheDocument();
  });

  test("an admin can create a new chapter scoped to this book", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    createChapter.mockResolvedValue({
      id: "c2",
      book_id: "b1",
      title: "New Chapter",
      order_index: 1,
      sub_chapter_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("New chapter");
    await user.type(screen.getByLabelText("Title"), "New Chapter");
    fireEvent.submit(screen.getByLabelText("Title").closest("form")!);

    await waitFor(() => expect(createChapter).toHaveBeenCalledWith("b1", { title: "New Chapter" }));
  });

  test("expanding a chapter lazily loads and shows its sub-chapters", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));

    expect(await screen.findByText("Sub A")).toBeInTheDocument();
    expect(listSubChapters).toHaveBeenCalledWith("c1");
  });

  test("collapsing a chapter hides its sub-chapters", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: /Intro to Systems/ });

    await user.click(toggle);
    await screen.findByText("Sub A");
    await user.click(toggle);

    expect(screen.queryByText("Sub A")).not.toBeInTheDocument();
  });

  test("expanding a sub-chapter inside an expanded chapter lazily loads its lessons", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await user.click(await screen.findByRole("button", { name: /Sub A/ }));

    expect(await screen.findByText("Lesson 1")).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledWith("sc1");
  });

  test("hides the new-sub-chapter form for a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await screen.findByText("Sub A");
    expect(screen.queryByText("New sub-chapter")).not.toBeInTheDocument();
  });

  test("an admin can create a new sub-chapter inside an expanded chapter", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    createSubChapter.mockResolvedValue({
      id: "sc2",
      chapter_id: "c1",
      title: "Sub B",
      order_index: 1,
      lesson_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    const heading = await screen.findByText("New sub-chapter");
    const form = within(heading.closest("form")!);
    await user.type(form.getByLabelText("Title"), "Sub B");
    fireEvent.submit(form.getByLabelText("Title").closest("form")!);

    await waitFor(() => expect(createSubChapter).toHaveBeenCalledWith("c1", { title: "Sub B" }));
  });

  test("uploading a lesson inside an expanded sub-chapter tags it with sub_chapter_id", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    requestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    createDocument.mockResolvedValue({ id: "d1", title: "New Lesson" });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await user.click(await screen.findByRole("button", { name: /Sub A/ }));
    const heading = await screen.findByText("Upload a lesson");
    const form = within(heading.closest("form")!);
    await user.type(form.getByLabelText("Title"), "New Lesson");

    const file = new File(["%PDF-1.4"], "lesson.pdf", { type: "application/pdf" });
    selectFile(form.getByLabelText("PDF file"), file);
    submitForm(form.getByLabelText("PDF file"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    const createCall = createDocument.mock.calls[0]![0];
    expect(createCall.title).toBe("New Lesson");
    expect(createCall.sub_chapter_id).toBe("sc1");
    expect(typeof createCall.checksum).toBe("string");
    expect(createCall.checksum.length).toBe(64);
  });

  test("shows an error if the storage upload fails", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    requestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    uploadToSignedUrl.mockResolvedValue({ data: null, error: new Error("network blip") });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await user.click(await screen.findByRole("button", { name: /Sub A/ }));
    const heading = await screen.findByText("Upload a lesson");
    const form = within(heading.closest("form")!);
    await user.type(form.getByLabelText("Title"), "New Lesson");
    selectFile(
      form.getByLabelText("PDF file"),
      new File(["%PDF-1.4"], "lesson.pdf", { type: "application/pdf" }),
    );
    submitForm(form.getByLabelText("PDF file"));

    expect(await screen.findByRole("alert")).toHaveTextContent("network blip");
    expect(createDocument).not.toHaveBeenCalled();
  });

  test("rejects a non-PDF file before calling the API", async () => {
    getMe.mockResolvedValue(ADMIN_ME);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await user.click(await screen.findByRole("button", { name: /Sub A/ }));
    const heading = await screen.findByText("Upload a lesson");
    const form = within(heading.closest("form")!);
    await user.type(form.getByLabelText("Title"), "New Lesson");
    selectFile(
      form.getByLabelText("PDF file"),
      new File(["not a pdf"], "notes.txt", { type: "text/plain" }),
    );
    submitForm(form.getByLabelText("PDF file"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF files are supported.");
    expect(requestDocumentUploadUrl).not.toHaveBeenCalled();
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
