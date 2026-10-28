import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { ForgotPasswordForm } from "./form";

test("renders the request form", () => {
  render(<ForgotPasswordForm expired={false} />);
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("explains a spent link when arriving from /auth/confirm", () => {
  render(<ForgotPasswordForm expired />);
  expect(screen.getByRole("alert")).toHaveTextContent(/expired or was already used/i);
  // Still submittable — the point is to send a fresh link, not just complain.
  expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
});

test("asks for an email and never for a password", () => {
  // The flow starts from the address, not the forgotten password. Guards
  // against a well-meaning "current password" field appearing here.
  render(<ForgotPasswordForm expired={false} />);
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});
