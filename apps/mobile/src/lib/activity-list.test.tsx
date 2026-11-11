import type { ActivityEvent } from "@lp/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ActivityList } from "./activity-list";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const base = {
  created_at: "2026-10-09T12:00:00Z",
  user: { id: "u2", display_name: "Bea", avatar_url: null },
  document_id: null,
  document_title: null,
  score_percent: null,
  question_count: null,
  streak_days: null,
};

const events: ActivityEvent[] = [
  { ...base, id: "e1", kind: "lesson_completed", document_id: "d1", document_title: "Cardio" },
  { ...base, id: "e2", kind: "exam_completed", score_percent: 87.5, question_count: 20 },
  { ...base, id: "e3", kind: "streak_milestone", streak_days: 7 },
];

beforeEach(() => mockPush.mockReset());

test("each kind reads as a sentence, and the name and lesson open what they name", () => {
  render(<ActivityList events={events} />);

  expect(screen.getByText("Bea completed Cardio")).toBeTruthy();
  expect(screen.getByText("Bea finished an exam with 87.5%")).toBeTruthy();
  expect(screen.getByText("Bea is on a 7-day streak")).toBeTruthy();

  fireEvent.press(screen.getByText("Cardio"));
  expect(mockPush).toHaveBeenCalledWith("/learn/d1");
  fireEvent.press(screen.getAllByText("Bea")[0]);
  expect(mockPush).toHaveBeenCalledWith("/profile/u2");
});
