import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import PrivacySettingsPage from "./page";

test("shows the placeholder", () => {
  render(<PrivacySettingsPage />);
  expect(screen.getByText("Privacy")).toBeInTheDocument();
  expect(screen.getByText("Nothing to configure yet.")).toBeInTheDocument();
});
