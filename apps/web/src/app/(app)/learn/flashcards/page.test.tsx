import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import FlashcardsPage from "./page";

const getMe = vi.fn();
const getFlashcardSummary = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, getFlashcardSummary }),
}));

function lesson(overrides: Record<string, unknown> = {}) {
  return { id: "d1", title: "Lesson 1", due_count: 0, new_count: 0, ...overrides };
}

beforeEach(() => {
  getMe.mockReset().mockResolvedValue({ id: "u1", email: "a@b.c", role: "student" });
  getFlashcardSummary.mockReset().mockResolvedValue({ books: [], uncategorized_lessons: [] });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FlashcardsPage />
    </QueryClientProvider>,
  );
}

describe("FlashcardsPage", () => {
  test("reports due and new separately rather than summing them", async () => {
    getFlashcardSummary.mockResolvedValue({
      books: [],
      uncategorized_lessons: [lesson({ due_count: 4, new_count: 12 })],
    });

    renderPage();

    // A card nobody has opened yet is not overdue — conflating the two would
    // make a freshly imported deck look like a backlog.
    expect(await screen.findByText("4 cards due today · 12 not studied yet.")).toBeInTheDocument();
  });

  test("a lesson row deep-links straight into that lesson's Flashcards tab", async () => {
    getFlashcardSummary.mockResolvedValue({
      books: [],
      uncategorized_lessons: [lesson({ due_count: 1 })],
    });

    renderPage();

    await userEvent.setup().click(await screen.findByRole("button", { name: /Uncategorized/ }));

    expect(screen.getByRole("link", { name: /Lesson 1/ })).toHaveAttribute(
      "href",
      "/learn/d1?tab=flashcards",
    );
  });

  test("expands a book down to its lessons without another request", async () => {
    getFlashcardSummary.mockResolvedValue({
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

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Book 1/ }));
    await user.click(screen.getByRole("button", { name: /Chapter 1/ }));
    await user.click(screen.getByRole("button", { name: /Sub 1/ }));

    expect(screen.getByRole("link", { name: /Lesson 1/ })).toBeInTheDocument();
    // One eager fetch — the counts require walking every lesson anyway.
    expect(getFlashcardSummary).toHaveBeenCalledTimes(1);
  });

  test("says so when there are no lessons at all", async () => {
    renderPage();
    expect(await screen.findByText("No lessons yet.")).toBeInTheDocument();
  });

  test("surfaces a load failure", async () => {
    getFlashcardSummary.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to load your flashcard summary.",
    );
  });

  test("hides the import link from a learner and shows it to an admin", async () => {
    renderPage();
    await screen.findByText("No lessons yet.");
    expect(screen.queryByRole("link", { name: /Import flashcards/ })).not.toBeInTheDocument();

    getMe.mockResolvedValue({ id: "u1", email: "a@b.c", role: "admin" });
    renderPage();
    expect(await screen.findByRole("link", { name: /Import flashcards/ })).toHaveAttribute(
      "href",
      "/learn/flashcards/manage",
    );
  });
});
