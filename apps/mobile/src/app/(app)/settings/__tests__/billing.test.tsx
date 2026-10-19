import { render, screen } from "@testing-library/react-native";

import BillingSettingsScreen from "../billing";

test("shows the placeholder", () => {
  render(<BillingSettingsScreen />);
  expect(screen.getByText("Subscription & Billing")).toBeTruthy();
  expect(screen.getByText("Coming soon.")).toBeTruthy();
});
