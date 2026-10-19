import { fireEvent, render, screen } from "@testing-library/react-native";

import SettingsLayout from "../_layout";

const mockPush = jest.fn();
const mockPathname = jest.fn();

jest.mock("expo-router", () => ({
  Slot: () => null,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  usePathname: () => mockPathname(),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockPathname.mockReset().mockReturnValue("/settings/account");
});

test("lists every section and a link back to the profile", () => {
  render(<SettingsLayout />);

  for (const label of [
    "Account",
    "Privacy",
    "Subscription & Billing",
    "Notifications",
    "Languages",
    "Appearance",
    "Profile Settings",
  ]) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  expect(screen.getByText("← Back to profile")).toBeTruthy();
});

test("tapping a section navigates to its route", () => {
  render(<SettingsLayout />);

  fireEvent.press(screen.getByText("Notifications"));

  expect(mockPush).toHaveBeenCalledWith("/settings/notifications");
});

test("the back link navigates to the profile screen", () => {
  render(<SettingsLayout />);

  fireEvent.press(screen.getByText("← Back to profile"));

  expect(mockPush).toHaveBeenCalledWith("/profile");
});
