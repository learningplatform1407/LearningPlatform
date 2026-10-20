import { render, screen } from "@testing-library/react-native";

import PrivacySettingsScreen from "../privacy";

test("shows the placeholder", () => {
  render(<PrivacySettingsScreen />);
  expect(screen.getByText("Privacy")).toBeTruthy();
  expect(screen.getByText("Nothing to configure yet.")).toBeTruthy();
});
