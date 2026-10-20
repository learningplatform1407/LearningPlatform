import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import LanguageSettingsPage from "./page";

const getMe = vi.fn();
const updateMe = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, updateMe }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageSettingsPage />
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

test("shows the current language and saves on submit", async () => {
  const user = userEvent.setup();
  renderPage();

  expect(await screen.findByDisplayValue("English")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(updateMe).toHaveBeenCalledWith({ language: "en" });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});
