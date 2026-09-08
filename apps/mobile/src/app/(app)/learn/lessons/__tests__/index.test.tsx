import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { TextInput } from "react-native";

import LessonsScreen from "../index";

const mockGetMe = jest.fn();
const mockListChapters = jest.fn();
const mockListDocuments = jest.fn();
const mockCreateChapter = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    listChapters: mockListChapters,
    listDocuments: mockListDocuments,
    createChapter: mockCreateChapter,
  }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LessonsScreen />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

beforeEach(() => {
  mockGetMe.mockReset();
  mockListChapters.mockReset();
  mockListDocuments.mockReset().mockResolvedValue([]);
  mockCreateChapter.mockReset();
  (router.push as jest.Mock).mockReset();
});

test("renders chapters with their sub-chapter counts and navigates on press", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListChapters.mockResolvedValue([
    { id: "c1", title: "Intro to Systems", order_index: 0, sub_chapter_count: 3 },
  ]);

  renderScreen();

  expect(await screen.findByText("Intro to Systems")).toBeTruthy();
  expect(screen.getByText("3 sub-chapters")).toBeTruthy();

  fireEvent.press(screen.getByText("Intro to Systems"));
  expect(router.push).toHaveBeenCalledWith("/learn/lessons/c1");
});

test("shows an Uncategorized row only when chapterless lessons exist", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListChapters.mockResolvedValue([]);
  mockListDocuments.mockResolvedValue([
    { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
  ]);

  renderScreen();

  expect(await screen.findByText("Uncategorized")).toBeTruthy();
  fireEvent.press(screen.getByText("Uncategorized"));
  expect(router.push).toHaveBeenCalledWith("/learn/lessons/uncategorized");
});

test("hides Uncategorized when there are no chapterless lessons", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListChapters.mockResolvedValue([
    { id: "c1", title: "Intro to Systems", order_index: 0, sub_chapter_count: 1 },
  ]);

  renderScreen();

  await screen.findByText("Intro to Systems");
  expect(screen.queryByText("Uncategorized")).toBeNull();
});

test("shows an empty state when there are no chapters and nothing uncategorized", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListChapters.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("No chapters yet.")).toBeTruthy();
});

test("hides the new-chapter form for a non-admin", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListChapters.mockResolvedValue([]);

  renderScreen();

  await screen.findByText("No chapters yet.");
  expect(screen.queryByText("New chapter")).toBeNull();
});

test("an admin can create a new chapter", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListChapters.mockResolvedValue([]);
  mockCreateChapter.mockResolvedValue({
    id: "c1",
    title: "New Chapter",
    order_index: 0,
    sub_chapter_count: 0,
  });

  renderScreen();

  await screen.findByText("New chapter");
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "New Chapter");
  fireEvent.press(screen.getByRole("button", { name: "Create chapter" }));

  await waitFor(() => expect(mockCreateChapter).toHaveBeenCalledWith({ title: "New Chapter" }));
});
