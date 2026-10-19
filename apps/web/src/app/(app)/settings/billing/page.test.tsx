import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import BillingSettingsPage from "./page";

test("shows the placeholder", () => {
  render(<BillingSettingsPage />);
  expect(screen.getByText("Subscription & Billing")).toBeInTheDocument();
  expect(screen.getByText("Coming soon.")).toBeInTheDocument();
});
