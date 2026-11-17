import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";

import SettingsIndexScreen from "../index";

// Replaces _layout.test.tsx, which asserted the left nav listed every
// section. There is no nav now: the sections are the page.
const mockGetMe = jest.fn();
const mockUpdateMe = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getMe: mockGetMe, updateMe: mockUpdateMe, deleteMe: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    storage: { from: () => ({ upload: jest.fn(), getPublicUrl: jest.fn() }) },
  },
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

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

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsIndexScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGetMe.mockReset().mockResolvedValue(me);
  mockUpdateMe.mockReset().mockResolvedValue(me);
  mockPush.mockReset();
});

test("every section is on the one page, one under another", async () => {
  renderScreen();

  for (const heading of [
    "Account",
    "Privacy",
    "Subscription & Billing",
    "Notifications",
    "Languages",
    "Appearance",
    "Profile Settings",
  ]) {
    expect(await screen.findByText(heading)).toBeTruthy();
  }

  // Each section's own controls are here too, not behind a menu item.
  expect(screen.getByText("Enable notifications")).toBeTruthy();
  expect(screen.getByText("Public profile")).toBeTruthy();
  expect(screen.getByText("English")).toBeTruthy();
  expect(screen.getByText("Sign out")).toBeTruthy();
  // Nothing navigates: the sections are not links to other screens.
  expect(mockPush).not.toHaveBeenCalled();
});

test("the sections that write as you go say so, and the one with fields keeps its Save", async () => {
  renderScreen();

  await screen.findByText("Notifications");
  // One note per autosaving section: Privacy, Notifications, Languages,
  // Appearance. Account and Billing save nothing; Profile has a Save button.
  expect(screen.getAllByText("Changes are saved as you make them.")).toHaveLength(4);
  expect(screen.getByText("Save")).toBeTruthy();
});

test("the account query is made once for the whole page", async () => {
  renderScreen();

  await screen.findByText("Appearance");
  expect(mockGetMe).toHaveBeenCalledTimes(1);
});
