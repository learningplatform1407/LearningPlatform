import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import LibraryPage from "./page";

const getMe = vi.fn();
const listBooks = vi.fn();
const listDocuments = vi.fn();
const createBook = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, listBooks, listDocuments, createBook }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LibraryPage />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

beforeEach(() => {
  getMe.mockReset();
  listBooks.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
  createBook.mockReset();
});

describe("LibraryPage", () => {
  test("renders books with their chapter counts", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listBooks.mockResolvedValue([
      { id: "b1", title: "Main Library", order_index: 0, chapter_count: 3 },
      { id: "b2", title: "Second Book", order_index: 1, chapter_count: 1 },
    ]);

    renderPage();

    expect(await screen.findByText("Main Library")).toBeInTheDocument();
    expect(screen.getByText("3 chapters")).toBeInTheDocument();
    expect(screen.getByText("1 chapter")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Main Library/ })).toHaveAttribute(
      "href",
      "/learn/library/b1",
    );
  });

  test("shows an Uncategorized entry only when chapterless lessons exist", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listBooks.mockResolvedValue([]);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();

    expect(await screen.findByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Uncategorized/ })).toHaveAttribute(
      "href",
      "/learn/library/uncategorized",
    );
  });

  test("hides Uncategorized when there are no chapterless lessons", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listBooks.mockResolvedValue([
      { id: "b1", title: "Main Library", order_index: 0, chapter_count: 1 },
    ]);
    listDocuments.mockResolvedValue([]);

    renderPage();

    await screen.findByText("Main Library");
    expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
  });

  test("shows an empty state when there are no books and nothing uncategorized", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listBooks.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No books yet.")).toBeInTheDocument();
  });

  test("hides the new-book form for a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listBooks.mockResolvedValue([]);

    renderPage();

    await screen.findByText("No books yet.");
    expect(screen.queryByText("New book")).not.toBeInTheDocument();
  });

  test("an admin can create a new book", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listBooks.mockResolvedValue([]);
    createBook.mockResolvedValue({
      id: "b1",
      title: "New Book",
      order_index: 0,
      chapter_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("New book");
    await user.type(screen.getByLabelText("Title"), "New Book");
    fireEvent.submit(screen.getByLabelText("Title").closest("form")!);

    await waitFor(() => expect(createBook).toHaveBeenCalledWith({ title: "New Book" }));
  });
});
