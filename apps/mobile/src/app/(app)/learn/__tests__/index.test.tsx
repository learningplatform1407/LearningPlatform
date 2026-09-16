import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import LearnScreen from "../index";

const mockListRecentLessons = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ listRecentLessons: mockListRecentLessons }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LearnScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockListRecentLessons.mockReset();
  (router.push as jest.Mock).mockReset();
});

test("shows Library, Quizzes, and Flashcards when nothing has been viewed yet", async () => {
  mockListRecentLessons.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("Library")).toBeTruthy();
  expect(screen.getByText("Quizzes")).toBeTruthy();
  expect(screen.getByText("Flashcards")).toBeTruthy();
  expect(screen.queryByText("Continue where you left off")).toBeNull();
  expect(screen.queryByText("Recently opened")).toBeNull();
});

test("navigates to Library, Quizzes, and Flashcards", async () => {
  mockListRecentLessons.mockResolvedValue([]);

  renderScreen();
  await screen.findByText("Library");

  fireEvent.press(screen.getByText("Library"));
  expect(router.push).toHaveBeenCalledWith("/learn/library");

  fireEvent.press(screen.getByText("Quizzes"));
  expect(router.push).toHaveBeenCalledWith("/learn/quizzes");

  fireEvent.press(screen.getByText("Flashcards"));
  expect(router.push).toHaveBeenCalledWith("/learn/flashcards");
});

test("shows the most recent lesson as Continue where you left off and navigates on press", async () => {
  mockListRecentLessons.mockResolvedValue([
    {
      id: "d1",
      title: "Latest lesson",
      created_at: "2026-01-01",
      status: "ready",
      last_viewed_at: "2026-09-08T12:00:00Z",
    },
  ]);

  renderScreen();

  expect(await screen.findByText("Continue where you left off")).toBeTruthy();
  fireEvent.press(screen.getByText("Latest lesson"));
  expect(router.push).toHaveBeenCalledWith("/learn/d1");
});

test("shows the rest as Recently opened, excluding the Continue lesson", async () => {
  mockListRecentLessons.mockResolvedValue([
    {
      id: "d1",
      title: "Most recent",
      created_at: "2026-01-01",
      status: "ready",
      last_viewed_at: "2026-09-08T12:00:00Z",
    },
    {
      id: "d2",
      title: "Second most recent",
      created_at: "2026-01-01",
      status: "ready",
      last_viewed_at: "2026-09-08T11:00:00Z",
    },
  ]);

  renderScreen();

  await screen.findByText("Continue where you left off");
  expect(screen.getByText("Recently opened")).toBeTruthy();
  expect(screen.getByText("Second most recent")).toBeTruthy();
  expect(screen.getAllByText("Most recent")).toHaveLength(1);
});
