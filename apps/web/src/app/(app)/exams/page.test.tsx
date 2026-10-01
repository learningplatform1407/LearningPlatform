import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import QuizzesPage from "./page";

const getMe = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <QuizzesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMe.mockReset();
});

test("hides the import-questions link for a non-admin", async () => {
  getMe.mockResolvedValue({ id: "u1", role: "student" });

  renderPage();

  expect(await screen.findByText("Coming soon.")).toBeInTheDocument();
  expect(screen.queryByText("Import questions →")).not.toBeInTheDocument();
});

test("shows the import-questions link for an admin", async () => {
  getMe.mockResolvedValue({ id: "u1", role: "admin" });

  renderPage();

  const link = await screen.findByRole("link", { name: "Import questions →" });
  expect(link).toHaveAttribute("href", "/learn/quizzes/manage");
});
