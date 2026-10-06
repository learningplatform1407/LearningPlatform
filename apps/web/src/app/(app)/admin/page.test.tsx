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

    // A directory, not a second home for these forms — each link points at
    // where the content lives, so the parent is always already chosen.
    expect(
      await screen.findByRole("link", { name: /Books, chapters and lectures/ }),
    ).toHaveAttribute("href", "/learn/library");
    expect(screen.getByRole("link", { name: /Import questions/ })).toHaveAttribute(
      "href",
      "/question-bank/manage",
    );
    expect(screen.getByRole("link", { name: /Import flashcards/ })).toHaveAttribute(
      "href",
      "/learn/flashcards/manage",
    );
  });
});
