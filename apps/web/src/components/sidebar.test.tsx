import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/learn",
}));

describe("Sidebar", () => {
  test("shows full labels and is pinned to the viewport when expanded", () => {
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Learn" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI Assistant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveClass("sticky", "top-0", "h-screen");
  });

  test("collapsing shows a pictogram per item, still reachable by its accessible name", async () => {
    render(<Sidebar />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const learn = screen.getByRole("link", { name: "Learn" });
    expect(learn).toHaveTextContent("📖");
    expect(screen.getByRole("link", { name: "AI Assistant" })).toHaveTextContent("🤖");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveTextContent("👤");
  });
});
