import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { I18nProvider } from "@/lib/i18n";

import LanguageSettingsScreen from "../languages";

const mockGetMe = jest.fn();
const mockUpdateMe = jest.fn();

// Signed in, so the provider follows the saved `settings.language`.
jest.mock("@/lib/auth-context", () => ({ useAuth: () => ({ session: { user: { id: "u1" } } }) }));

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

test("offers Romanian, and saving it switches the interface", async () => {
  mockUpdateMe.mockResolvedValue({ ...me, settings: { ...me.settings, language: "ro" } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <LanguageSettingsScreen />
      </I18nProvider>
    </QueryClientProvider>,
  );

  fireEvent.press(await screen.findByText("Română"));
  fireEvent.press(screen.getByText("Save"));

  await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ language: "ro" }));
  // The saved `me` lands in the shared query cache, which the provider reads.
  expect(await screen.findByText("Salvează")).toBeTruthy();
  expect(screen.getByText("Limbi")).toBeTruthy();
});
