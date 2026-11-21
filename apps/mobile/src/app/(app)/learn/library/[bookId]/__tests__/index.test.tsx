import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import BookScreen from "../index";

const mockGetMe = jest.fn();
const mockListChapters = jest.fn();
const mockListSubChapters = jest.fn();
const mockListDocuments = jest.fn();
const mockGetQuestionBankTree = jest.fn();
const mockListBooks = jest.fn();

let mockBookId = "b1";

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    listChapters: mockListChapters,
    listSubChapters: mockListSubChapters,
    listDocuments: mockListDocuments,
    getQuestionBankTree: mockGetQuestionBankTree,
    listBooks: mockListBooks,
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

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
  mockListBooks
    .mockReset()
    .mockResolvedValue([{ id: "b1", title: "Orthopaedics", chapter_count: 1 }]);
  (useLocalSearchParams as jest.Mock).mockImplementation(() => ({ bookId: mockBookId }));
  mockGetMe.mockReset();
  mockListChapters.mockReset().mockResolvedValue(CHAPTERS);
  mockListSubChapters.mockReset().mockResolvedValue(SUB_CHAPTERS);
  mockListDocuments.mockReset().mockResolvedValue([]);
  mockGetQuestionBankTree.mockReset().mockResolvedValue(EMPTY_TREE);
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

  test("offers no chapter authoring, to an admin least of all", async () => {
    // Library authoring is web-only (/admin/library, docs/architecture).
    // These are the pages every learner browses.
    mockGetMe.mockResolvedValue(ADMIN_ME);

    renderScreen();

    await screen.findByText("Intro to Systems");
    expect(screen.queryByText("New chapter")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create chapter" })).toBeNull();
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

  test("offers no sub-chapter or lesson authoring to an admin either", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Existing Lesson", created_at: "2026-01-01", status: "ready" },
    ]);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));

    await screen.findByText("Existing Lesson");
    expect(screen.queryByText("New sub-chapter")).toBeNull();
    expect(screen.queryByText("Upload a lesson")).toBeNull();
    // Nor the per-lesson "replace the lecture text / PDF" controls.
    expect(screen.queryByTestId("lesson-admin-controls-d1")).toBeNull();
  });
});

// RNTL's getByRole doesn't recognize "progressbar" as a queryable role (it's
// outside the fixed set RNTL maps from accessibilityRole), unlike "button"
// used throughout the rest of this file — the bar carries its own testID
// instead, the same testID escape hatch the lesson rows use here.
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

  test("lists chapterless lessons directly, with no book or chapter fetch", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);

    renderScreen();

    expect(await screen.findByText("Uncategorized")).toBeTruthy();
    expect(screen.getByText("Loose lesson")).toBeTruthy();
    expect(mockListDocuments).toHaveBeenCalledWith("none");
    expect(mockListChapters).not.toHaveBeenCalled();
    // Uploading a loose lesson is web-only too.
    expect(screen.queryByText("Upload a lesson")).toBeNull();
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

test("the book's name heads the screen", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);

  renderScreen();

  expect(await screen.findByText("Orthopaedics")).toBeTruthy();
  expect(screen.getByText("Library · Chapters")).toBeTruthy();
});
