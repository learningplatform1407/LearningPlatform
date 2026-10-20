import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import LanguageSettingsScreen from "../languages";

const mockGetMe = jest.fn();
const mockUpdateMe = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getMe: mockGetMe, updateMe: mockUpdateMe }),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageSettingsScreen />
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

test("shows the current language and saves on submit", async () => {
  renderScreen();

  expect(await screen.findByText("English")).toBeTruthy();
  fireEvent.press(screen.getByText("Save"));

  await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ language: "en" }));
  expect(await screen.findByText("Saved.")).toBeTruthy();
});
