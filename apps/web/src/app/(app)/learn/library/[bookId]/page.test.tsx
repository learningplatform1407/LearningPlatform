import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import BookPage from "./page";

const listChapters = vi.fn();
const listSubChapters = vi.fn();
const listDocuments = vi.fn();
const getQuestionBankTree = vi.fn();

let mockBookId = "b1";

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    listChapters,
    listSubChapters,
    listDocuments,
    getQuestionBankTree,
  }),
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
  listChapters.mockReset().mockResolvedValue(CHAPTERS);
  listSubChapters.mockReset().mockResolvedValue(SUB_CHAPTERS);
  listDocuments.mockReset().mockResolvedValue([]);
  getQuestionBankTree.mockReset().mockResolvedValue(EMPTY_TREE);
});

// Creating/uploading content is an admin tool -- it now lives at
// /admin/library/[bookId], not here, regardless of the viewer's role. See
// admin/library/[bookId]/page.test.tsx.
describe("BookPage (real book)", () => {
  test("renders chapters for the book, collapsed by default", async () => {
    renderPage();

    expect(await screen.findByRole("button", { name: /Intro to Systems/ })).toBeInTheDocument();
    expect(screen.getByText(/1 sub-chapter/)).toBeInTheDocument();
    expect(listChapters).toHaveBeenCalledWith("b1");
    expect(listSubChapters).not.toHaveBeenCalled();
  });

  test("shows an empty state when the book has no chapters", async () => {
    listChapters.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No chapters yet.")).toBeInTheDocument();
  });

  test("never shows the new-chapter form", async () => {
    renderPage();

    await screen.findByText(/Intro to Systems/);
    expect(screen.queryByText("New chapter")).not.toBeInTheDocument();
  });

  test("expanding a chapter lazily loads and shows its sub-chapters", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));

    expect(await screen.findByText("Sub A")).toBeInTheDocument();
    expect(listSubChapters).toHaveBeenCalledWith("c1");
  });

  test("collapsing a chapter hides its sub-chapters", async () => {
    renderPage();
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: /Intro to Systems/ });

    await user.click(toggle);
    await screen.findByText("Sub A");
    await user.click(toggle);

    expect(screen.queryByText("Sub A")).not.toBeInTheDocument();
  });

  test("expanding a sub-chapter inside an expanded chapter lazily loads its lessons", async () => {
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

  test("never shows the new-sub-chapter form", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await screen.findByText("Sub A");
    expect(screen.queryByText("New sub-chapter")).not.toBeInTheDocument();
  });

  test("never shows the upload-a-lesson form", async () => {
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Intro to Systems/ }));
    await user.click(await screen.findByRole("button", { name: /Sub A/ }));
    await screen.findByText("Lesson 1");

    expect(screen.queryByText("Upload a lesson")).not.toBeInTheDocument();
  });
});

describe("BookPage progress bars", () => {
  test("shows the book's overall progress immediately, with no chapter expanded", async () => {
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

  test("lists chapterless lessons directly, with no book/chapter fetch or upload form", async () => {
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Uncategorized" })).toBeInTheDocument();
    expect(await screen.findByText("Loose lesson")).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledWith("none");
    expect(listChapters).not.toHaveBeenCalled();
    expect(screen.queryByText("Upload a lesson")).not.toBeInTheDocument();
  });

  test("status labels render for each lesson status", async () => {
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
