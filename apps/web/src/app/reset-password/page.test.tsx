import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import ResetPasswordPage from "./page";

test("renders both password fields", () => {
  render(<ResetPasswordPage />);
  expect(screen.getByLabelText("New password")).toBeInTheDocument();
  expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save new password" })).toBeInTheDocument();
});

test("warns that every device including this one gets signed out", () => {
  // The global revoke is invisible unless the form says so, and being bounced
  // to /login straight after setting a password reads as a failed reset.
  render(<ResetPasswordPage />);
  expect(screen.getByText(/signed out on every device, including this one/i)).toBeInTheDocument();
});
