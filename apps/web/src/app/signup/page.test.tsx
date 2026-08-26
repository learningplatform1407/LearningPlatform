import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import SignupPage from "./page";

test("renders the signup form", () => {
  render(<SignupPage />);
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
});
