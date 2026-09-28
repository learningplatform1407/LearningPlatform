import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import ReviewSummaryPage from "./page";

const getReviewSummary = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getReviewSummary }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewSummaryPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getReviewSummary.mockReset();
});

describe("ReviewSummaryPage", () => {
  test("shows the total due count and each book collapsed by default", async () => {
    getReviewSummary.mockResolvedValue({
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

    renderPage();

    expect(await screen.findByText("Book A")).toBeInTheDocument();
    expect(screen.getByText("3 words due today across your course.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Book A/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Chapter 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Lesson A")).not.toBeInTheDocument();
  });

  test("expanding each level reveals the next, down to the lesson row and its due badge", async () => {
    getReviewSummary.mockResolvedValue({
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

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Book A/ }));
    expect(await screen.findByText("Chapter 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Chapter 1/ }));
    expect(await screen.findByText("Sub 1.1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sub 1.1/ }));
    expect(await screen.findByText("Lesson A")).toBeInTheDocument();
    expect(screen.getAllByText("3 due").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Lesson A/ })).toHaveAttribute(
      "href",
      "/learn/d1?tab=review",
    );
  });

  test("shows a zero-due node without filtering it out", async () => {
    getReviewSummary.mockResolvedValue({
      books: [{ id: "b1", title: "Empty Book", due_count: 0, chapters: [] }],
      uncategorized_lessons: [],
    });

    renderPage();

    expect(await screen.findByText("Empty Book")).toBeInTheDocument();
    expect(screen.getByText("0 words due today across your course.")).toBeInTheDocument();
    expect(screen.getByText("0 due")).toBeInTheDocument();
  });

  test("shows an Uncategorized section for chapterless lessons", async () => {
    getReviewSummary.mockResolvedValue({
      books: [],
      uncategorized_lessons: [{ id: "d9", title: "Loose lesson", due_count: 2 }],
    });

    renderPage();
    const user = userEvent.setup();

    const toggle = await screen.findByRole("button", { name: /Uncategorized/ });
    await user.click(toggle);

    expect(await screen.findByText("Loose lesson")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Loose lesson/ })).toHaveAttribute(
      "href",
      "/learn/d9?tab=review",
    );
  });

  test("shows an empty state when there are no books and nothing uncategorized", async () => {
    getReviewSummary.mockResolvedValue({ books: [], uncategorized_lessons: [] });

    renderPage();

    expect(await screen.findByText("No lessons yet.")).toBeInTheDocument();
  });

  test("shows an error message when the summary fails to load", async () => {
    getReviewSummary.mockRejectedValue(new Error("boom"));

    renderPage();

    expect(await screen.findByText("Failed to load your review summary.")).toBeInTheDocument();
  });
});
