import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { DailyFollowing } from "./daily-following";

const getDailyFollowing = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getDailyFollowing }),
}));

function renderBlock() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DailyFollowing />
    </QueryClientProvider>,
  );
}

beforeEach(() => getDailyFollowing.mockReset());

test("shows how the people you follow did, without their picks", async () => {
  getDailyFollowing.mockResolvedValue({
    answered_count: 2,
    correct_count: 1,
    answers: [
      { user: { id: "u2", display_name: "Ana", avatar_url: null }, outcome: "correct" },
      { user: { id: "u3", display_name: "Bea", avatar_url: null }, outcome: "incorrect" },
    ],
  });
  renderBlock();

  expect(await screen.findByText("1 of 2 got it right")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ana" })).toHaveAttribute("href", "/profile/u2");
  expect(screen.getByText("correct")).toBeInTheDocument();
  expect(screen.getByText("incorrect")).toBeInTheDocument();
});

test("renders nothing while none of them has answered", async () => {
  getDailyFollowing.mockResolvedValue({ answered_count: 0, correct_count: 0, answers: [] });
  const { container } = renderBlock();

  await vi.waitFor(() => expect(getDailyFollowing).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
