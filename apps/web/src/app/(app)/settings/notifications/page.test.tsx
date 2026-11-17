import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import NotificationsSettingsPage from "./page";

const getMe = vi.fn();
const updateMe = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, updateMe }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationsSettingsPage />
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

test("the notifications toggle writes as it is clicked, with no Save button", async () => {
  updateMe.mockResolvedValue({ ...me, settings: { ...me.settings, notifications_enabled: false } });

  const user = userEvent.setup();
  renderPage();

  const toggle = await screen.findByLabelText("Enable notifications");
  await user.click(toggle);

  expect(updateMe).toHaveBeenCalledWith({ notifications_enabled: false });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  // The box shows the new state without waiting for the response (the
  // optimistic write), and keeps it once the response lands.
  expect(toggle).not.toBeChecked();
});

test("a failed write puts the toggle back and says so", async () => {
  updateMe.mockRejectedValue(new Error("offline"));

  const user = userEvent.setup();
  renderPage();

  const toggle = await screen.findByLabelText("Enable notifications");
  await user.click(toggle);

  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to save: offline");
  expect(toggle).toBeChecked();
});
