import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import FlashcardsScreen from "../flashcards";

const mockGetFlashcardSummary = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getFlashcardSummary: mockGetFlashcardSummary,
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

function lesson(overrides: Record<string, unknown> = {}) {
  return { id: "d1", title: "Lesson 1", due_count: 0, new_count: 0, ...overrides };
}

beforeEach(() => {
  mockGetFlashcardSummary.mockReset().mockResolvedValue({
    books: [],
    uncategorized_lessons: [],
  });
  (router.push as jest.Mock).mockReset();
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FlashcardsScreen />
    </QueryClientProvider>,
  );
}

test("reports due and new separately rather than summing them", async () => {
  mockGetFlashcardSummary.mockResolvedValue({
    books: [],
    uncategorized_lessons: [lesson({ due_count: 4, new_count: 12 })],
  });

  renderScreen();

  // A card nobody has opened yet is not overdue — conflating the two would
  // make a freshly imported deck look like a backlog.
  expect(await screen.findByText("4 cards due today · 12 not studied yet.")).toBeTruthy();
});

test("a lesson row deep-links straight into that lesson's Flashcards tab", async () => {
  mockGetFlashcardSummary.mockResolvedValue({
    books: [],
    uncategorized_lessons: [lesson({ due_count: 1 })],
  });

  renderScreen();

  fireEvent.press(await screen.findByText("Uncategorized"));
  fireEvent.press(screen.getByText("Lesson 1"));

  expect(router.push).toHaveBeenCalledWith("/learn/d1?tab=flashcards");
});

test("expands a book down to its lessons without another request", async () => {
  mockGetFlashcardSummary.mockResolvedValue({
    books: [
      {
        id: "b1",
        title: "Book 1",
        due_count: 2,
        new_count: 0,
        chapters: [
          {
            id: "c1",
            title: "Chapter 1",
            due_count: 2,
            new_count: 0,
            sub_chapters: [
              {
                id: "s1",
                title: "Sub 1",
                due_count: 2,
                new_count: 0,
                lessons: [lesson({ due_count: 2 })],
              },
            ],
          },
        ],
      },
    ],
    uncategorized_lessons: [],
  });

  renderScreen();

  fireEvent.press(await screen.findByText("Book 1"));
  fireEvent.press(screen.getByText("Chapter 1"));
  fireEvent.press(screen.getByText("Sub 1"));

  expect(screen.getByText("Lesson 1")).toBeTruthy();
  // One eager fetch — the counts require walking every lesson anyway.
  expect(mockGetFlashcardSummary).toHaveBeenCalledTimes(1);
});

test("says so when there are no lessons at all", async () => {
  renderScreen();
  expect(await screen.findByText("No lessons yet.")).toBeTruthy();
});

test("surfaces a load failure", async () => {
  mockGetFlashcardSummary.mockRejectedValue(new Error("boom"));
  renderScreen();
  expect(await screen.findByText("Failed to load your flashcard summary.")).toBeTruthy();
});
