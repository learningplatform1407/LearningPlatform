import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import PrivacySettingsScreen from "../privacy";

const mockGetMe = jest.fn();
const mockUpdateMe = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getMe: mockGetMe, updateMe: mockUpdateMe }),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivacySettingsScreen />
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
  settings: { theme: "system", notifications_enabled: true, language: "en", profile_public: false },
};

beforeEach(() => {
  mockGetMe.mockReset().mockResolvedValue(me);
  mockUpdateMe.mockReset().mockResolvedValue(me);
  mockPush.mockReset();
});

test("making the profile public", async () => {
  mockUpdateMe.mockResolvedValue({ ...me, settings: { ...me.settings, profile_public: true } });

  renderScreen();
  fireEvent(await screen.findByLabelText("Public profile"), "valueChange", true);
  fireEvent.press(screen.getByText("Save"));

  await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ profile_public: true }));
  expect(await screen.findByText("Saved.")).toBeTruthy();
});

test("a profile without a display name is sent to add one first", async () => {
  mockGetMe.mockResolvedValue({ ...me, display_name: null });

  renderScreen();
  expect((await screen.findByLabelText("Public profile")).props.disabled).toBe(true);
  fireEvent.press(screen.getByText(/Add a display name/));

  expect(mockPush).toHaveBeenCalledWith("/settings/profile");
});
