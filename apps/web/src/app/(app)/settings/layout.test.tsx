import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import SettingsLayout from "./layout";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

test("lists every section", () => {
  mockUsePathname.mockReturnValue("/settings/account");

  render(
    <SettingsLayout>
      <p>content</p>
    </SettingsLayout>,
  );

  for (const label of [
    "Account",
    "Privacy",
    "Subscription & Billing",
    "Notifications",
    "Languages",
    "Appearance",
    "Profile Settings",
  ]) {
    expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
  }
  expect(screen.getByText("content")).toBeInTheDocument();
});

test("marks the current section's link active", () => {
  mockUsePathname.mockReturnValue("/settings/notifications");

  render(
    <SettingsLayout>
      <p>content</p>
    </SettingsLayout>,
  );

  expect(screen.getByRole("link", { name: "Notifications" })).toHaveClass("text-primary");
  expect(screen.getByRole("link", { name: "Account" })).not.toHaveClass("text-primary");
});
