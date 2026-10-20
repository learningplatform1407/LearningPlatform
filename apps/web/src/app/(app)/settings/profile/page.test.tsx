import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import ProfileSettingsPage from "./page";

const getMe = vi.fn();
const updateMe = vi.fn();
const upload = vi.fn();
const getPublicUrl = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, updateMe }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload, getPublicUrl }) },
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileSettingsPage />
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
  getMe.mockReset().mockResolvedValue(me);
  updateMe.mockReset().mockResolvedValue(me);
  upload.mockReset().mockResolvedValue({ error: null });
  getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: "https://example.com/a.png" } });
});

test("shows the form pre-filled from the current profile", async () => {
  renderPage();

  expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
  expect(screen.getByDisplayValue("MIT")).toBeInTheDocument();
  expect(screen.getByDisplayValue("ada@example.com")).toBeDisabled();
});

test("shows a load error", async () => {
  getMe.mockRejectedValue(new Error("boom"));

  renderPage();

  expect(await screen.findByText(/Failed to load profile: boom/)).toBeInTheDocument();
});

test("saving the display name and university", async () => {
  updateMe.mockResolvedValue({ ...me, display_name: "Ada Lovelace", university: "Cambridge" });

  const user = userEvent.setup();
  renderPage();
  const nameInput = await screen.findByDisplayValue("Ada");
  await user.clear(nameInput);
  await user.type(nameInput, "Ada Lovelace");
  const universityInput = screen.getByDisplayValue("MIT");
  await user.clear(universityInput);
  await user.type(universityInput, "Cambridge");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(updateMe).toHaveBeenCalledWith({ display_name: "Ada Lovelace", university: "Cambridge" });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("uploading an avatar updates the profile", async () => {
  updateMe.mockResolvedValue({ ...me, avatar_url: "https://example.com/a.png" });

  renderPage();
  await screen.findByDisplayValue("Ada");

  const file = new File(["x"], "avatar.png", { type: "image/png" });
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const user = userEvent.setup();
  await user.upload(fileInput, file);

  expect(upload).toHaveBeenCalled();
  expect(await screen.findByDisplayValue("ada@example.com")).toBeInTheDocument();
});
