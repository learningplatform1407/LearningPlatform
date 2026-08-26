import { render, screen } from "@testing-library/react-native";

import SignupScreen from "../signup";

test("renders the signup form", () => {
  render(<SignupScreen />);
  expect(screen.getByPlaceholderText("Email")).toBeTruthy();
  expect(screen.getByPlaceholderText("Password")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
});
