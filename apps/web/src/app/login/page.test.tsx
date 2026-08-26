import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import LoginPage from "./page";

test("renders the login form", () => {
  render(<LoginPage />);
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
});
