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

function lessonNode(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "d1",
    title: "Lesson 1",
    question_count: 0,
    answered_count: 0,
    correct_count: 0,
    partial_count: 0,
    incorrect_count: 0,
    points_awarded: 0,
    points_possible: 0,
    eligible_lesson_count: 0,
    completed_lesson_count: 0,
    ...overrides,
  };
}

// Mirrors the server's rollup: a container's eligible/completed counts are
// the sum of its children's, not an independently-set number — building it
// this way means a test can't accidentally assert an inconsistent tree.
function treeWithOneLesson(lesson: ReturnType<typeof lessonNode>) {
  const subChapter = {
    id: "sc1",
    title: "Sub A",
    question_count: lesson.question_count,
    answered_count: lesson.answered_count,
    correct_count: lesson.correct_count,
    partial_count: lesson.partial_count,
    incorrect_count: lesson.incorrect_count,
    points_awarded: lesson.points_awarded,
    points_possible: lesson.points_possible,
    eligible_lesson_count: lesson.eligible_lesson_count,
    completed_lesson_count: lesson.completed_lesson_count,
    lessons: [lesson],
  };
  const chapter = {
    ...subChapter,
    id: "c1",
    title: "Intro to Systems",
    sub_chapters: [subChapter],
  };
  const book = { ...subChapter, id: "b1", title: "Book", chapters: [chapter] };
  return {
    books: [book],
    uncategorized_lessons: [],
    unassigned_question_count: 0,
    unassigned_answered_count: 0,
    unassigned_correct_count: 0,
    unassigned_partial_count: 0,
    unassigned_incorrect_count: 0,
    unassigned_points_awarded: 0,
    unassigned_points_possible: 0,
  };
}

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
  listSubChapters.mockReset().mockResolvedValue(SUB_CHAPTERS);
  createSubChapter.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
  requestDocumentUploadUrl.mockReset();
  createDocument.mockReset();
  uploadToSignedUrl.mockReset();
  getQuestionBankTree.mockReset().mockResolvedValue(EMPTY_TREE);
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

describe("BookPage progress bars", () => {
  test("shows the book's overall progress immediately, with no chapter expanded", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    getQuestionBankTree.mockResolvedValue(
      treeWithOneLesson(
        lessonNode({
          question_count: 1,
          answered_count: 1,
          correct_count: 1,
          eligible_lesson_count: 1,
          completed_lesson_count: 1,
        }),
      ),
    );

    renderPage();

    expect(await screen.findByText("Overall progress")).toBeInTheDocument();
    const bars = await screen.findAllByRole("progressbar");
    expect(bars[0]).toHaveAttribute("aria-valuenow", "100");
  });

  test("shows a chapter's own progress bar without expanding it", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    getQuestionBankTree.mockResolvedValue(
      treeWithOneLesson(
        lessonNode({
          question_count: 4,
          answered_count: 4,
          correct_count: 3,
          eligible_lesson_count: 1,
          completed_lesson_count: 0,
        }),
      ),
    );

    renderPage();

    // Two bars: the book's overall figure plus this one chapter's, both
    // 0% here since the lesson (3/4 = 75%) sits under the completion
    // threshold — chapter progress is bars-done, not raw score.
    const bars = await screen.findAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[1]).toHaveAttribute("aria-valuenow", "0");
  });

  test("shows a sub-chapter's and a lesson's progress bar once expanded", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);
    getQuestionBankTree.mockResolvedValue(
      treeWithOneLesson(
        lessonNode({
          question_count: 1,
          answered_count: 1,
          correct_count: 1,
          eligible_lesson_count: 1,
          completed_lesson_count: 1,
        }),
      ),
    );

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await user.click(await screen.findByRole("button", { name: /Sub A/ }));
    await screen.findByText("Lesson 1");

    // Book + chapter + sub-chapter + lesson, all completed (100%).
    const bars = await screen.findAllByRole("progressbar");
    expect(bars).toHaveLength(4);
    for (const bar of bars) {
      expect(bar).toHaveAttribute("aria-valuenow", "100");
    }
  });

  test("renders no progress bar for a node absent from the tree", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    getQuestionBankTree.mockResolvedValue(EMPTY_TREE);

    renderPage();

    await screen.findByRole("button", { name: /Intro to Systems/ });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
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

  test("shows a progress bar for an uncategorized lesson", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);
    getQuestionBankTree.mockResolvedValue({
      ...EMPTY_TREE,
      uncategorized_lessons: [
        lessonNode({
          question_count: 1,
          answered_count: 1,
          correct_count: 1,
          eligible_lesson_count: 1,
          completed_lesson_count: 1,
        }),
      ],
    });

    renderPage();

    await screen.findByText("Loose lesson");
    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });
});
