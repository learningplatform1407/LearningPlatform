import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";

import ProfileSettingsScreen from "../profile";

const mockGetMe = jest.fn();
const mockUpdateMe = jest.fn();
const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getMe: mockGetMe, updateMe: mockUpdateMe }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileSettingsScreen />
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

const realFetch = globalThis.fetch;

beforeEach(() => {
  mockGetMe.mockReset().mockResolvedValue(me);
  mockUpdateMe.mockReset().mockResolvedValue(me);
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockGetPublicUrl
    .mockReset()
    .mockReturnValue({ data: { publicUrl: "https://example.com/a.png" } });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockReset();
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReset();
  globalThis.fetch = jest.fn().mockResolvedValue({ blob: async () => ({ size: 10 }) }) as never;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("shows the form pre-filled from the current profile", async () => {
  renderScreen();

  expect(await screen.findByDisplayValue("Ada")).toBeTruthy();
  expect(screen.getByDisplayValue("MIT")).toBeTruthy();
  expect(screen.getByText("ada@example.com")).toBeTruthy();
});

test("shows a load error", async () => {
  mockGetMe.mockRejectedValue(new Error("boom"));

  renderScreen();

  expect(await screen.findByText("Failed to load profile: boom")).toBeTruthy();
});

test("saving the display name and university", async () => {
  mockUpdateMe.mockResolvedValue({ ...me, display_name: "Ada Lovelace", university: "Cambridge" });

  renderScreen();
  const nameInput = await screen.findByDisplayValue("Ada");
  fireEvent.changeText(nameInput, "Ada Lovelace");
  const universityInput = screen.getByDisplayValue("MIT");
  fireEvent.changeText(universityInput, "Cambridge");
  fireEvent.press(screen.getByText("Save"));

  await waitFor(() =>
    expect(mockUpdateMe).toHaveBeenCalledWith({
      display_name: "Ada Lovelace",
      university: "Cambridge",
    }),
  );
  expect(await screen.findByText("Saved.")).toBeTruthy();
});

test("uploading an avatar updates the profile", async () => {
  mockUpdateMe.mockResolvedValue({ ...me, avatar_url: "https://example.com/a.png" });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://avatar.png", mimeType: "image/png", fileSize: 10 }],
  });

  renderScreen();
  await screen.findByDisplayValue("Ada");

  fireEvent.press(screen.getByLabelText("Change profile picture"));

  await waitFor(() => expect(mockUpload).toHaveBeenCalled());
  expect(await screen.findByText("ada@example.com")).toBeTruthy();
});
