import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "./page";

test("renders the home page heading", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: "LearningPlatform" })).toBeInTheDocument();
});
