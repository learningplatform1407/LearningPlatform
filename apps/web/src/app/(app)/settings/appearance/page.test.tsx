import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import AppearanceSettingsPage from "./page";

const getMe = vi.fn();
const updateMe = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, updateMe }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppearanceSettingsPage />
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
});

test("picking a theme writes it, with no Save button", async () => {
  updateMe.mockResolvedValue({ ...me, settings: { ...me.settings, theme: "dark" } });

  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Dark" }));

  expect(updateMe).toHaveBeenCalledWith({ theme: "dark" });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  // The chosen segment stays chosen: it reads the cache the write updated,
  // not local state the response could contradict.
  expect(await screen.findByRole("button", { name: "Dark", pressed: true })).toBeInTheDocument();
});
