import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { TextInput } from "react-native";

import LibraryScreen from "../index";

const mockGetMe = jest.fn();
const mockListBooks = jest.fn();
const mockListDocuments = jest.fn();
const mockCreateBook = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    listBooks: mockListBooks,
    listDocuments: mockListDocuments,
    createBook: mockCreateBook,
  }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LibraryScreen />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

beforeEach(() => {
  mockGetMe.mockReset();
  mockListBooks.mockReset();
  mockListDocuments.mockReset().mockResolvedValue([]);
  mockCreateBook.mockReset();
  (router.push as jest.Mock).mockReset();
});

test("renders books with their chapter counts and navigates on press", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListBooks.mockResolvedValue([
    { id: "b1", title: "Main Library", order_index: 0, chapter_count: 3 },
  ]);

  renderScreen();

  expect(await screen.findByText("Main Library")).toBeTruthy();
  expect(screen.getByText("3 chapters")).toBeTruthy();

  fireEvent.press(screen.getByText("Main Library"));
  expect(router.push).toHaveBeenCalledWith("/learn/library/b1");
});

test("shows an Uncategorized row only when chapterless lessons exist", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListBooks.mockResolvedValue([]);
  mockListDocuments.mockResolvedValue([
    { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
  ]);

  renderScreen();

  expect(await screen.findByText("Uncategorized")).toBeTruthy();
  fireEvent.press(screen.getByText("Uncategorized"));
  expect(router.push).toHaveBeenCalledWith("/learn/library/uncategorized");
});

test("hides Uncategorized when there are no chapterless lessons", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListBooks.mockResolvedValue([
    { id: "b1", title: "Main Library", order_index: 0, chapter_count: 1 },
  ]);

  renderScreen();

  await screen.findByText("Main Library");
  expect(screen.queryByText("Uncategorized")).toBeNull();
});

test("shows an empty state when there are no books and nothing uncategorized", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListBooks.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("No books yet.")).toBeTruthy();
});

test("hides the new-book form for a non-admin", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListBooks.mockResolvedValue([]);

  renderScreen();

  await screen.findByText("No books yet.");
  expect(screen.queryByText("New book")).toBeNull();
});

test("an admin can create a new book", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListBooks.mockResolvedValue([]);
  mockCreateBook.mockResolvedValue({
    id: "b1",
    title: "New Book",
    order_index: 0,
    chapter_count: 0,
  });

  renderScreen();

  await screen.findByText("New book");
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "New Book");
  fireEvent.press(screen.getByRole("button", { name: "Create book" }));

  await waitFor(() => expect(mockCreateBook).toHaveBeenCalledWith({ title: "New Book" }));
});
