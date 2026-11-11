import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import PrivacySettingsPage from "./page";

const getMe = vi.fn();
const updateMe = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, updateMe }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivacySettingsPage />
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
  getMe.mockReset().mockResolvedValue(me);
  updateMe.mockReset().mockResolvedValue(me);
});

test("making the profile public", async () => {
  updateMe.mockResolvedValue({ ...me, settings: { ...me.settings, profile_public: true } });

  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByLabelText("Public profile"));
  expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(updateMe).toHaveBeenCalledWith({ profile_public: true });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("a profile without a display name can't be made public", async () => {
  getMe.mockResolvedValue({ ...me, display_name: null });

  renderPage();

  expect(await screen.findByLabelText("Public profile")).toBeDisabled();
  expect(screen.getByRole("link", { name: /Add a display name/ })).toHaveAttribute(
    "href",
    "/settings/profile",
  );
});
