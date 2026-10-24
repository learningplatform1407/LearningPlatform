import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import AdminLibraryPage from "./page";

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
      <AdminLibraryPage />
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

describe("AdminLibraryPage", () => {
  test("refuses a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);

    renderPage();

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
  });

  test("links books into the admin tree, not the learner one", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listBooks.mockResolvedValue([
      { id: "b1", title: "Main Library", order_index: 0, chapter_count: 3 },
    ]);

    renderPage();

    expect(await screen.findByRole("link", { name: /Main Library/ })).toHaveAttribute(
      "href",
      "/admin/library/b1",
    );
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
