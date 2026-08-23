import { render, screen } from "@testing-library/react-native";

import HomeScreen from "../index";

test("renders the home screen title", () => {
  render(<HomeScreen />);
  expect(screen.getByText("LearningPlatform")).toBeTruthy();
});
