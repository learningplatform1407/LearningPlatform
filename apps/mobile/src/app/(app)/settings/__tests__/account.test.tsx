import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import AccountSettingsScreen from "../account";

const mockGetMe = jest.fn();
const mockDeleteMe = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getMe: mockGetMe, deleteMe: mockDeleteMe }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: (...args: unknown[]) => mockSignOut(...args) } },
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountSettingsScreen />
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
  mockDeleteMe.mockReset().mockResolvedValue(undefined);
  mockSignOut.mockReset();
});

test("shows the account email", async () => {
  renderScreen();
  expect(await screen.findByText("ada@example.com")).toBeTruthy();
});

test("opening Delete Account shows the confirmation overlay", async () => {
  renderScreen();

  fireEvent.press(await screen.findByText("Delete Account"));

  expect(await screen.findByText(/permanently delete your account/)).toBeTruthy();
});

test("closing the overlay does not delete the account", async () => {
  renderScreen();

  fireEvent.press(await screen.findByText("Delete Account"));
  fireEvent.press(await screen.findByText("Close"));

  expect(mockDeleteMe).not.toHaveBeenCalled();
});

test("confirming delete calls deleteMe then signs out", async () => {
  renderScreen();

  fireEvent.press(await screen.findByText("Delete Account"));
  fireEvent.press(await screen.findByText("Delete my account"));

  await waitFor(() => expect(mockDeleteMe).toHaveBeenCalled());
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
});

test("a failed deletion shows the error instead of signing out", async () => {
  mockDeleteMe.mockRejectedValue(new Error("boom"));
  renderScreen();

  fireEvent.press(await screen.findByText("Delete Account"));
  fireEvent.press(await screen.findByText("Delete my account"));

  expect(await screen.findByText("Failed to delete account: boom")).toBeTruthy();
  expect(mockSignOut).not.toHaveBeenCalled();
});
