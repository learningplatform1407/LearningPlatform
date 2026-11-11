import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";

import { DailyFollowing } from "./daily-following";

const mockGetDailyFollowing = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getDailyFollowing: mockGetDailyFollowing }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

function renderBlock() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DailyFollowing />
    </QueryClientProvider>,
  );
}

beforeEach(() => mockGetDailyFollowing.mockReset());

test("shows how the people you follow did", async () => {
  mockGetDailyFollowing.mockResolvedValue({
    answered_count: 2,
    correct_count: 1,
    answers: [
      { user: { id: "u2", display_name: "Ana", avatar_url: null }, outcome: "correct" },
      { user: { id: "u3", display_name: "Bea", avatar_url: null }, outcome: "incorrect" },
    ],
  });
  renderBlock();

  expect(await screen.findByText("1 of 2 got it right")).toBeTruthy();
  expect(screen.getByText("Ana")).toBeTruthy();
  expect(screen.getByText("incorrect")).toBeTruthy();
});

test("renders nothing while none of them has answered", async () => {
  mockGetDailyFollowing.mockResolvedValue({ answered_count: 0, correct_count: 0, answers: [] });
  renderBlock();

  await waitFor(() => expect(mockGetDailyFollowing).toHaveBeenCalled());
  expect(screen.queryByText("People you follow")).toBeNull();
});
