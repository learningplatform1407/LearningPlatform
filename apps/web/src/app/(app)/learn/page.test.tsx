import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import LearnPage from "./page";

const listRecentLessons = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ listRecentLessons }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LearnPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listRecentLessons.mockReset();
});

describe("LearnPage", () => {
  test("shows the Lessons option when nothing has been viewed yet", async () => {
    listRecentLessons.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole("link", { name: /Lessons/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Flashcards/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Continue where you left off")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently opened")).not.toBeInTheDocument();
  });

  test("shows the most recent lesson as Continue where you left off", async () => {
    listRecentLessons.mockResolvedValue([
      {
        id: "d1",
        title: "Latest lesson",
        created_at: "2026-01-01",
        status: "ready",
        last_viewed_at: "2026-09-08T12:00:00Z",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Continue where you left off")).toBeInTheDocument();
    const continueLink = screen.getByRole("link", { name: /Latest lesson/ });
    expect(continueLink).toHaveAttribute("href", "/learn/d1");
  });

  test("shows the rest as Recently opened, excluding the Continue lesson", async () => {
    listRecentLessons.mockResolvedValue([
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

    renderPage();

    await screen.findByText("Continue where you left off");
    expect(screen.getByText("Recently opened")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Second most recent/ })).toBeInTheDocument();
    // "Most recent" only appears once — inside the Continue card, not duplicated below.
    expect(screen.getAllByText("Most recent")).toHaveLength(1);
  });
});
