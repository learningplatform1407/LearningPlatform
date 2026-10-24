import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import AdminPage from "./page";

const getMe = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe }),
}));

beforeEach(() => {
  getMe.mockReset().mockResolvedValue({ id: "u1", email: "a@b.c", role: "student" });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

describe("AdminPage", () => {
  test("shows nothing but a refusal to a learner", async () => {
    renderPage();

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Import questions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Import flashcards/ })).not.toBeInTheDocument();
  });

  test("links an admin to every content tool, at the path that actually owns it", async () => {
    getMe.mockResolvedValue({ id: "u1", email: "a@b.c", role: "admin" });

    renderPage();

    expect(
      await screen.findByRole("link", { name: /Books, chapters and lectures/ }),
    ).toHaveAttribute("href", "/admin/library");
    expect(screen.getByRole("link", { name: /Import questions/ })).toHaveAttribute(
      "href",
      "/question-bank/manage",
    );
    expect(screen.getByRole("link", { name: /Import flashcards/ })).toHaveAttribute(
      "href",
      "/learn/flashcards/manage",
    );
    // The one tool here that is *not* where its content lives, because
    // planning a fortnight ahead wants every day in one view. Recorded as a
    // deliberate exception in docs/architecture/README.md.
    expect(screen.getByRole("link", { name: /Question of the day/ })).toHaveAttribute(
      "href",
      "/admin/question-of-the-day",
    );
  });
});
