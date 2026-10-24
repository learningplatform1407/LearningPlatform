import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import LibraryPage from "./page";

const listBooks = vi.fn();
const listDocuments = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ listBooks, listDocuments }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LibraryPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listBooks.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
});

describe("LibraryPage", () => {
  test("renders books with their chapter counts", async () => {
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
    listBooks.mockResolvedValue([
      { id: "b1", title: "Main Library", order_index: 0, chapter_count: 1 },
    ]);
    listDocuments.mockResolvedValue([]);

    renderPage();

    await screen.findByText("Main Library");
    expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
  });

  test("shows an empty state when there are no books and nothing uncategorized", async () => {
    listBooks.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No books yet.")).toBeInTheDocument();
  });

  // Creating a book is an admin tool -- it now lives at /admin/library, not
  // here, regardless of the viewer's role. See admin/library/page.test.tsx.
  test("never shows the new-book form", async () => {
    listBooks.mockResolvedValue([]);

    renderPage();

    await screen.findByText("No books yet.");
    expect(screen.queryByText("New book")).not.toBeInTheDocument();
  });
});
