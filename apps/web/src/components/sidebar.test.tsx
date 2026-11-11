import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";

import { Sidebar } from "./sidebar";

const pathname = vi.hoisted(() => ({ current: "/learn" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

const getMe = vi.fn();
const listChallenges = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, listChallenges }),
}));

beforeEach(() => {
  pathname.current = "/learn";
  getMe.mockReset().mockResolvedValue({ id: "u1", email: "a@b.c", role: "student" });
  listChallenges.mockReset().mockResolvedValue([]);
});

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Sidebar />
      </ThemeProvider>
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

  test("collapsing leaves an icon per item, still reachable by its accessible name", async () => {
    renderSidebar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Collapse sidebar" }));

    for (const name of ["Learn", "AI Assistant", "Profile"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveTextContent("");
      expect(link.querySelector("svg")).not.toBeNull();
    }
  });

  test("marks the current section with aria-current", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Learn" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Feed" })).not.toHaveAttribute("aria-current");
  });

  test("steps aside inside a lesson, which owns the whole screen", () => {
    pathname.current = "/learn/0b6c8f1e-6a1d-4a52-9f3e-2b1c4d5e6f70";
    renderSidebar();

    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
  });

  test("stays on Learn's own sub-pages, which are not lessons", () => {
    pathname.current = "/learn/library";
    renderSidebar();

    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
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

  test("the mobile menu button opens an off-canvas drawer with full labels", async () => {
    renderSidebar();
    const user = userEvent.setup();

    expect(screen.queryByRole("navigation", { name: "Mobile menu" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const drawer = screen.getByRole("navigation", { name: "Mobile menu" });
    expect(within(drawer).getByRole("link", { name: "Learn" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  test("the close button dismisses the mobile drawer", async () => {
    renderSidebar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("button", { name: "Close menu" }));

    expect(screen.queryByRole("navigation", { name: "Mobile menu" })).not.toBeInTheDocument();
  });

  test("Escape dismisses the mobile drawer", async () => {
    renderSidebar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("navigation", { name: "Mobile menu" })).not.toBeInTheDocument();
  });

  test("counts the challenges waiting for you on Exam Hub", async () => {
    const challenge = { direction: "incoming", status: "pending" };
    listChallenges.mockResolvedValue([
      { ...challenge, id: "c1" },
      { ...challenge, id: "c2" },
      { ...challenge, id: "c3", status: "completed" },
      { ...challenge, id: "c4", direction: "sent" },
    ]);
    renderSidebar();

    expect(await screen.findByRole("link", { name: "Exam Hub, 2 waiting" })).toHaveAttribute(
      "href",
      "/exams",
    );
  });
});
