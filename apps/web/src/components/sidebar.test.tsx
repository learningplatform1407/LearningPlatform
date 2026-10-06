import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/learn",
}));

const getMe = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe }),
}));

beforeEach(() => {
  getMe.mockReset().mockResolvedValue({ id: "u1", email: "a@b.c", role: "student" });
});

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Sidebar />
    </QueryClientProvider>,
  );
}

describe("Sidebar", () => {
  test("shows full labels and is pinned to the viewport when expanded", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Learn" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI Assistant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveClass(
      "sticky",
      "top-0",
      "h-screen",
    );
  });

  test("collapsing shows a pictogram per item, still reachable by its accessible name", async () => {
    renderSidebar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const learn = screen.getByRole("link", { name: "Learn" });
    expect(learn).toHaveTextContent("📖");
    expect(screen.getByRole("link", { name: "AI Assistant" })).toHaveTextContent("🤖");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveTextContent("👤");
  });

  test("has no Admin entry for a learner", async () => {
    renderSidebar();

    // "Learn" is a static NAV_ITEMS entry that renders before getMe
    // resolves, so awaiting it proved nothing — the Admin assertion ran
    // while me.data was still undefined and would have passed even with the
    // gate inverted. Wait for the role to actually arrive instead.
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    // Sanity check that the gate is live at all, not just that nothing rendered.
    expect(screen.getByRole("link", { name: "Learn" })).toBeInTheDocument();
  });

  test("shows the Admin entry for an admin", async () => {
    getMe.mockResolvedValue({ id: "u1", email: "a@b.c", role: "admin" });
    renderSidebar();

    expect(await screen.findByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });
});
