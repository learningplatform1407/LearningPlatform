import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import NotificationsSettingsScreen from "../notifications";

const mockGetMe = jest.fn();
const mockUpdateMe = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getMe: mockGetMe, updateMe: mockUpdateMe }),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationsSettingsScreen />
    </QueryClientProvider>,
  );
}

const me = {
  id: "u1",
  email: "ada@example.com",
  display_name: "Ada",
  avatar_url: null,
  university: "MIT",
  role: "student",
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  settings: { theme: "system", notifications_enabled: true, language: "en" },
};

beforeEach(() => {
  mockGetMe.mockReset().mockResolvedValue(me);
  mockUpdateMe.mockReset().mockResolvedValue(me);
});

test("the toggle writes as it is switched, with no Save button", async () => {
  mockUpdateMe.mockResolvedValue({
    ...me,
    settings: { ...me.settings, notifications_enabled: false },
  });

  renderScreen();
  const toggle = await screen.findByRole("switch");
  fireEvent(toggle, "valueChange", false);

  await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ notifications_enabled: false }));
  expect(screen.queryByText("Save")).toBeNull();
  // The switch shows the new position without waiting for the response (the
  // optimistic write), and keeps it once the response lands.
  expect((await screen.findByRole("switch")).props.value).toBe(false);
});

test("a failed write puts the switch back and says so", async () => {
  mockUpdateMe.mockRejectedValue(new Error("offline"));

  renderScreen();
  fireEvent(await screen.findByRole("switch"), "valueChange", false);

  expect(await screen.findByText("Failed to save: offline")).toBeTruthy();
  expect(screen.getByRole("switch").props.value).toBe(true);
});
