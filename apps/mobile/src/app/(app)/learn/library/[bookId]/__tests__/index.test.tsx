import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { TextInput } from "react-native";

import BookScreen from "../index";

const mockGetMe = jest.fn();
const mockListChapters = jest.fn();
const mockCreateChapter = jest.fn();
const mockListSubChapters = jest.fn();
const mockCreateSubChapter = jest.fn();
const mockListDocuments = jest.fn();
const mockRequestDocumentUploadUrl = jest.fn();
const mockCreateDocument = jest.fn();
const mockUploadToSignedUrl = jest.fn();
const mockGetQuestionBankTree = jest.fn();

let mockBookId = "b1";

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    listChapters: mockListChapters,
    createChapter: mockCreateChapter,
    listSubChapters: mockListSubChapters,
    createSubChapter: mockCreateSubChapter,
    listDocuments: mockListDocuments,
    requestDocumentUploadUrl: mockRequestDocumentUploadUrl,
    createDocument: mockCreateDocument,
    getQuestionBankTree: mockGetQuestionBankTree,
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ uploadToSignedUrl: mockUploadToSignedUrl }) } },
}));

jest.mock("@/lib/checksum", () => ({
  sha256Hex: jest.fn().mockResolvedValue("a".repeat(64)),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookScreen />
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
// the sum of its children's, not an independently-set number.
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
  (useLocalSearchParams as jest.Mock).mockImplementation(() => ({ bookId: mockBookId }));
  mockGetMe.mockReset();
  mockListChapters.mockReset().mockResolvedValue(CHAPTERS);
  mockCreateChapter.mockReset();
  mockListSubChapters.mockReset().mockResolvedValue(SUB_CHAPTERS);
  mockCreateSubChapter.mockReset();
  mockListDocuments.mockReset().mockResolvedValue([]);
  mockRequestDocumentUploadUrl.mockReset();
  mockCreateDocument.mockReset();
  mockUploadToSignedUrl.mockReset();
  mockGetQuestionBankTree.mockReset().mockResolvedValue(EMPTY_TREE);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
  (router.push as jest.Mock).mockReset();
});

describe("BookScreen (real book)", () => {
  test("renders chapters scoped to the book, collapsed by default", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();

    expect(await screen.findByText("Intro to Systems")).toBeTruthy();
    expect(screen.getByText(/1 sub-chapter/)).toBeTruthy();
    expect(mockListChapters).toHaveBeenCalledWith("b1");
    expect(mockListSubChapters).not.toHaveBeenCalled();
  });

  test("shows an empty state when the book has no chapters", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListChapters.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText("No chapters yet.")).toBeTruthy();
  });

  test("hides the new-chapter form for a non-admin", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();

    await screen.findByText("Intro to Systems");
    expect(screen.queryByText("New chapter")).toBeNull();
  });

  test("an admin can create a new chapter scoped to this book", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockCreateChapter.mockResolvedValue({
      id: "c2",
      book_id: "b1",
      title: "New Chapter",
      order_index: 1,
      sub_chapter_count: 0,
    });

    renderScreen();

    await screen.findByText("New chapter");
    fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "New Chapter");
    fireEvent.press(screen.getByRole("button", { name: "Create chapter" }));

    await waitFor(() =>
      expect(mockCreateChapter).toHaveBeenCalledWith("b1", { title: "New Chapter" }),
    );
  });

  test("expanding a chapter lazily loads and shows its sub-chapters", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    expect(await screen.findByText("Sub A")).toBeTruthy();
    expect(mockListSubChapters).toHaveBeenCalledWith("c1");
  });

  test("expanding a sub-chapter inside an expanded chapter lazily loads its lessons", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));

    expect(await screen.findByText("Lesson 1")).toBeTruthy();
    expect(mockListDocuments).toHaveBeenCalledWith("sc1");
  });

  test("navigates to the lesson reader when a lesson row is pressed", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));
    fireEvent.press(await screen.findByText("Lesson 1"));

    expect(router.push).toHaveBeenCalledWith("/learn/d1");
  });

  test("shows an empty state when there are no sub-chapters", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListSubChapters.mockResolvedValue([]);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    expect(await screen.findByText("No sub-chapters yet.")).toBeTruthy();
  });

  test("hides the new-sub-chapter form for a non-admin", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    await screen.findByText("Sub A");
    expect(screen.queryByText("New sub-chapter")).toBeNull();
  });

  test("an admin can create a new sub-chapter inside an expanded chapter", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockCreateSubChapter.mockResolvedValue({
      id: "sc2",
      chapter_id: "c1",
      title: "Sub B",
      order_index: 1,
      lesson_count: 0,
    });

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    await screen.findByText("New sub-chapter");
    fireEvent.changeText(screen.getByTestId("sub-chapter-title-input"), "Sub B");
    fireEvent.press(screen.getByRole("button", { name: "Create sub-chapter" }));

    await waitFor(() =>
      expect(mockCreateSubChapter).toHaveBeenCalledWith("c1", { title: "Sub B" }),
    );
  });

  test("uploading a lesson inside an expanded sub-chapter tags it with sub_chapter_id", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///lesson.pdf", name: "lesson.pdf", size: 1234, mimeType: "application/pdf" },
      ],
    });
    mockRequestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    mockUploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    mockCreateDocument.mockResolvedValue({ id: "d1", title: "New Lesson" });
    globalThis.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    }) as unknown as typeof fetch;

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));

    await screen.findByText("Upload a lesson");
    fireEvent.changeText(screen.getByTestId("lesson-title-input"), "New Lesson");
    fireEvent.press(screen.getByText("Choose PDF file"));
    await screen.findByText("lesson.pdf");

    fireEvent.press(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
    const createCall = (mockCreateDocument.mock.calls[0] ?? [])[0];
    expect(createCall.title).toBe("New Lesson");
    expect(createCall.sub_chapter_id).toBe("sc1");
    expect(createCall.checksum).toBe("a".repeat(64));
  });

  test("rejects a non-PDF file before calling the API", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///notes.txt", name: "notes.txt", size: 10, mimeType: "text/plain" }],
    });

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));

    await screen.findByText("Upload a lesson");
    fireEvent.changeText(screen.getByTestId("lesson-title-input"), "New Lesson");
    fireEvent.press(screen.getByText("Choose PDF file"));
    await screen.findByText("notes.txt");

    fireEvent.press(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("Only PDF files are supported.")).toBeTruthy();
    expect(mockRequestDocumentUploadUrl).not.toHaveBeenCalled();
  });
});

// RNTL's getByRole doesn't recognize "progressbar" as a queryable role (it's
// outside the fixed set RNTL maps from accessibilityRole), unlike "button"
// used throughout the rest of this file — the bar carries its own testID
// instead, the same escape hatch "lesson-title-input" etc. already use here.
async function findProgressBars() {
  return screen.findAllByTestId("progress-bar");
}

describe("BookScreen progress bars", () => {
  test("shows the book's overall progress immediately, with no chapter expanded", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockGetQuestionBankTree.mockResolvedValue(
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

    renderScreen();

    expect(await screen.findByText("Overall progress")).toBeTruthy();
    const bars = await findProgressBars();
    expect(bars[0]!.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
  });

  test("shows a chapter's own progress bar without expanding it", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockGetQuestionBankTree.mockResolvedValue(
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

    renderScreen();

    // Book's overall figure plus this one chapter's, both 0% here since the
    // lesson (3/4 = 75%) sits under the completion threshold.
    const bars = await findProgressBars();
    expect(bars).toHaveLength(2);
    expect(bars[1]!.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 0 });
  });

  test("shows a sub-chapter's and a lesson's progress bar once expanded", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);
    mockGetQuestionBankTree.mockResolvedValue(
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

    renderScreen();

    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));
    await screen.findByText("Lesson 1");

    // Book + chapter + sub-chapter + lesson, all completed (100%).
    const bars = await findProgressBars();
    expect(bars).toHaveLength(4);
    for (const bar of bars) {
      expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
    }
  });

  test("renders no progress bar for a node absent from the tree", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockGetQuestionBankTree.mockResolvedValue(EMPTY_TREE);

    renderScreen();

    await screen.findByText("Intro to Systems");
    expect(screen.queryAllByTestId("progress-bar")).toHaveLength(0);
  });
});

describe("BookScreen (Uncategorized)", () => {
  beforeEach(() => {
    mockBookId = "uncategorized";
  });

  test("lists chapterless lessons directly, no book/chapter fetch, and uploads without a sub_chapter_id", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///lesson.pdf", name: "lesson.pdf", size: 1234, mimeType: "application/pdf" },
      ],
    });
    mockRequestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    mockUploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    mockCreateDocument.mockResolvedValue({ id: "d2", title: "Another loose lesson" });
    globalThis.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    }) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText("Uncategorized")).toBeTruthy();
    expect(screen.getByText("Loose lesson")).toBeTruthy();
    expect(mockListDocuments).toHaveBeenCalledWith("none");
    expect(mockListChapters).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId("lesson-title-input"), "Another loose lesson");
    fireEvent.press(screen.getByText("Choose PDF file"));
    await screen.findByText("lesson.pdf");
    fireEvent.press(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
    expect(mockCreateDocument.mock.calls[0]![0].sub_chapter_id).toBeUndefined();
  });

  test("shows a progress bar for an uncategorized lesson", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);
    mockGetQuestionBankTree.mockResolvedValue({
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

    renderScreen();

    await screen.findByText("Loose lesson");
    const [bar] = await findProgressBars();
    expect(bar!.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
  });
});
