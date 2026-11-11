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
  opponent: null,
  opponent_score_percent: null,
};

const events: ActivityEvent[] = [
  { ...base, id: "e1", kind: "lesson_completed", document_id: "d1", document_title: "Cardio" },
  { ...base, id: "e2", kind: "exam_completed", score_percent: 87.5, question_count: 20 },
  { ...base, id: "e3", kind: "streak_milestone", streak_days: 7 },
  {
    ...base,
    id: "e4",
    kind: "challenge_completed",
    score_percent: 80,
    opponent: { id: "u3", display_name: "Cris", avatar_url: null },
    opponent_score_percent: 70,
  },
];

beforeEach(() => mockPush.mockReset());

test("each kind reads as a sentence, and the name and lesson open what they name", () => {
  render(<ActivityList events={events} />);

  expect(screen.getByText("Bea completed Cardio")).toBeTruthy();
  expect(screen.getByText("Bea finished an exam with 87.5%")).toBeTruthy();
  expect(screen.getByText("Bea is on a 7-day streak")).toBeTruthy();
  expect(screen.getByText("Bea took on Cris in a challenge: 80% to 70%")).toBeTruthy();

  fireEvent.press(screen.getByText("Cardio"));
  expect(mockPush).toHaveBeenCalledWith("/learn/d1");
  fireEvent.press(screen.getAllByText("Bea")[0]!);
  expect(mockPush).toHaveBeenCalledWith("/profile/u2");
});
