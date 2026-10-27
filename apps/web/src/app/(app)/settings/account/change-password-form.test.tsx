import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { ChangePasswordForm } from "./change-password-form";

test("asks for the current password as well as the new one", () => {
  render(<ChangePasswordForm />);
  // The current-password field is the whole point: Supabase would accept the
  // change on the session alone, which makes an unlocked laptop a takeover.
  expect(screen.getByLabelText("Current password")).toBeInTheDocument();
  expect(screen.getByLabelText("New password")).toBeInTheDocument();
  expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
});

test("warns that every device including this one gets signed out, and offers the reset flow", () => {
  // Same rule as /reset-password. Saying so matters because being bounced to
  // /login immediately after is otherwise indistinguishable from a failure.
  render(<ChangePasswordForm />);
  expect(screen.getByText(/signed out on every device, including this one/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Reset it by email" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});
