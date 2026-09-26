import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import ReviewSummaryScreen from "../index";

const mockGetReviewSummary = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getReviewSummary: mockGetReviewSummary }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewSummaryScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGetReviewSummary.mockReset();
  (router.push as jest.Mock).mockReset();
});

test("shows the total due count and each book collapsed by default", async () => {
  mockGetReviewSummary.mockResolvedValue({
    books: [
      {
        id: "b1",
        title: "Book A",
        due_count: 3,
        chapters: [
          {
            id: "c1",
            title: "Chapter 1",
            due_count: 3,
            sub_chapters: [
              {
                id: "sc1",
                title: "Sub 1.1",
                due_count: 3,
                lessons: [{ id: "d1", title: "Lesson A", due_count: 3 }],
              },
            ],
          },
        ],
      },
    ],
    uncategorized_lessons: [],
  });

  renderScreen();

  expect(await screen.findByText("Book A")).toBeTruthy();
  expect(screen.getByText("3 words due today across your course.")).toBeTruthy();
  expect(screen.queryByText("Chapter 1")).toBeNull();
  expect(screen.queryByText("Lesson A")).toBeNull();
});

test("expanding each level reveals the next, down to the lesson row and its due badge", async () => {
  mockGetReviewSummary.mockResolvedValue({
    books: [
      {
        id: "b1",
        title: "Book A",
        due_count: 3,
        chapters: [
          {
            id: "c1",
            title: "Chapter 1",
            due_count: 3,
            sub_chapters: [
              {
                id: "sc1",
                title: "Sub 1.1",
                due_count: 3,
                lessons: [{ id: "d1", title: "Lesson A", due_count: 3 }],
              },
            ],
          },
        ],
      },
    ],
    uncategorized_lessons: [],
  });

  renderScreen();

  fireEvent.press(await screen.findByText("Book A"));
  expect(await screen.findByText("Chapter 1")).toBeTruthy();

  fireEvent.press(screen.getByText("Chapter 1"));
  expect(await screen.findByText("Sub 1.1")).toBeTruthy();

  fireEvent.press(screen.getByText("Sub 1.1"));
  expect(await screen.findByText("Lesson A")).toBeTruthy();

  fireEvent.press(screen.getByText("Lesson A"));
  expect(router.push).toHaveBeenCalledWith("/learn/d1?tab=review");
});

test("shows a zero-due node without filtering it out", async () => {
  mockGetReviewSummary.mockResolvedValue({
    books: [{ id: "b1", title: "Empty Book", due_count: 0, chapters: [] }],
    uncategorized_lessons: [],
  });

  renderScreen();

  expect(await screen.findByText("Empty Book")).toBeTruthy();
  expect(screen.getByText("0 words due today across your course.")).toBeTruthy();
  expect(screen.getByText("0 due")).toBeTruthy();
});

test("shows an Uncategorized section for chapterless lessons", async () => {
  mockGetReviewSummary.mockResolvedValue({
    books: [],
    uncategorized_lessons: [{ id: "d9", title: "Loose lesson", due_count: 2 }],
  });

  renderScreen();

  fireEvent.press(await screen.findByText("Uncategorized"));
  expect(await screen.findByText("Loose lesson")).toBeTruthy();

  fireEvent.press(screen.getByText("Loose lesson"));
  expect(router.push).toHaveBeenCalledWith("/learn/d9?tab=review");
});

test("shows an empty state when there are no books and nothing uncategorized", async () => {
  mockGetReviewSummary.mockResolvedValue({ books: [], uncategorized_lessons: [] });

  renderScreen();

  expect(await screen.findByText("No lessons yet.")).toBeTruthy();
});

test("shows an error message when the summary fails to load", async () => {
  mockGetReviewSummary.mockRejectedValue(new Error("boom"));

  renderScreen();

  expect(await screen.findByText("Failed to load your review summary.")).toBeTruthy();
});
