import { render, screen } from "@testing-library/react-native";

import LoginScreen from "../login";

test("renders the login form", () => {
  render(<LoginScreen />);
  expect(screen.getByPlaceholderText("Email")).toBeTruthy();
  expect(screen.getByPlaceholderText("Password")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Log in" })).toBeTruthy();
});
