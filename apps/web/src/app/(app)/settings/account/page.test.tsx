import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import AccountSettingsPage from "./page";

const getMe = vi.fn();
const deleteMe = vi.fn();
const logout = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, deleteMe }),
}));

vi.mock("../../actions", () => ({ logout: () => logout() }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountSettingsPage />
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
  deleteMe.mockReset().mockResolvedValue(undefined);
  logout.mockReset();
});

test("shows the account email", async () => {
  renderPage();
  expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
});

test("opening Delete Account shows a confirmation dialog", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Delete Account" }));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText(/permanently delete your account/)).toBeInTheDocument();
});

test("cancelling the dialog does not delete the account", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Delete Account" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(deleteMe).not.toHaveBeenCalled();
});

test("confirming delete calls deleteMe then signs out", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Delete Account" }));
  await user.click(screen.getByRole("button", { name: "Delete my account" }));

  expect(deleteMe).toHaveBeenCalled();
  await vi.waitFor(() => expect(logout).toHaveBeenCalled());
});

test("a failed deletion shows the error instead of signing out", async () => {
  deleteMe.mockRejectedValue(new Error("boom"));
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Delete Account" }));
  await user.click(screen.getByRole("button", { name: "Delete my account" }));

  expect(await screen.findByText(/Failed to delete account: boom/)).toBeInTheDocument();
  expect(logout).not.toHaveBeenCalled();
});
