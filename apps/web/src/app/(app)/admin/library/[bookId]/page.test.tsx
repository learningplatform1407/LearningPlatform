import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import AdminBookPage from "./page";

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
// the form directly sidesteps that gap.
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
const getQuestionBankTree = vi.fn();

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
    getQuestionBankTree,
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
      <AdminBookPage />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };
const CHAPTERS = [
  { id: "c1", book_id: "b1", title: "Intro to Systems", order_index: 0, sub_chapter_count: 1 },
];

const EMPTY_TREE = {
  books: [],
  uncategorized_lessons: [],
  unassigned_question_count: 0,
  unassigned_answered_count: 0,
  unassigned_correct_count: 0,
  unassigned_partial_count: 0,
  unassigned_incorrect_count: 0,
  unassigned_points_awarded: 0,
  unassigned_points_possible: 0,
};

beforeEach(() => {
  mockBookId = "b1";
  getMe.mockReset();
  listChapters.mockReset().mockResolvedValue(CHAPTERS);
  createChapter.mockReset();
  listSubChapters.mockReset().mockResolvedValue([]);
  createSubChapter.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
  requestDocumentUploadUrl.mockReset();
  createDocument.mockReset();
  uploadToSignedUrl.mockReset();
  getQuestionBankTree.mockReset().mockResolvedValue(EMPTY_TREE);
});

describe("AdminBookPage", () => {
  test("refuses a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
    expect(listChapters).not.toHaveBeenCalled();
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
    listSubChapters.mockResolvedValue([
      { id: "sc1", chapter_id: "c1", title: "Sub A", order_index: 0, lesson_count: 1 },
    ]);
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
    listSubChapters.mockResolvedValue([
      { id: "sc1", chapter_id: "c1", title: "Sub A", order_index: 0, lesson_count: 1 },
    ]);
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
    listSubChapters.mockResolvedValue([
      { id: "sc1", chapter_id: "c1", title: "Sub A", order_index: 0, lesson_count: 1 },
    ]);

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

describe("AdminBookPage (Uncategorized)", () => {
  beforeEach(() => {
    mockBookId = "uncategorized";
  });

  test("uploads a loose lesson without a sub_chapter_id", async () => {
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

    await user.type(screen.getByLabelText("Title"), "Another loose lesson");
    selectFile(
      screen.getByLabelText("PDF file"),
      new File(["%PDF-1.4"], "lesson.pdf", { type: "application/pdf" }),
    );
    submitForm(screen.getByLabelText("PDF file"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    expect(createDocument.mock.calls[0]![0].sub_chapter_id).toBeUndefined();
  });
});
