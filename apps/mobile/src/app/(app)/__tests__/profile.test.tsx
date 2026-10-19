import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";

import ProfileScreen from "../profile";

const mockGetMe = jest.fn();
const mockGetMyStats = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({ getMe: mockGetMe, getMyStats: mockGetMyStats }),
}));

jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

const me = {
  id: "u1",
  email: "ada@example.com",
  display_name: "Ada",
  avatar_url: null,
  university: "MIT",
  role: "student",
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  settings: { theme: "system", notifications_enabled: true, language: "en" },
};

const zeroStats = {
  current_streak_days: 0,
  longest_streak_days: 0,
  lessons_completed: 0,
  lessons_eligible: 0,
  exams_completed: 0,
  exam_average_score_percent: null,
  questions_attempted: 0,
  questions_answered_lifetime: 0,
  question_accuracy_percent: null,
};

beforeEach(() => {
  mockGetMe.mockReset().mockResolvedValue(me);
  mockGetMyStats.mockReset().mockResolvedValue(zeroStats);
  mockPush.mockReset();
});

test("shows the read-only header: display name and joined date", async () => {
  renderScreen();

  expect(await screen.findByText("Ada")).toBeTruthy();
  expect(screen.getByText("Joined January 2026")).toBeTruthy();
  expect(screen.queryByText("ada@example.com")).toBeNull();
});

test("the Edit Profile button navigates to the new settings page", async () => {
  renderScreen();

  fireEvent.press(await screen.findByText("Edit Profile"));

  expect(mockPush).toHaveBeenCalledWith("/settings/profile");
});

test("shows a load error", async () => {
  mockGetMe.mockRejectedValue(new Error("boom"));

  renderScreen();

  expect(await screen.findByText("Failed to load profile: boom")).toBeTruthy();
});

test("the stats section shows its own loading state without blocking identity", async () => {
  mockGetMyStats.mockImplementation(() => new Promise(() => {}));

  renderScreen();

  expect(await screen.findByText("Ada")).toBeTruthy();
  expect(screen.getByText("Loading stats...")).toBeTruthy();
});

test("renders the zero-state hero trio, chart, and only the joined badge earned", async () => {
  renderScreen();

  expect(await screen.findByText("No streak yet")).toBeTruthy();
  expect(screen.getByText("0 of 0 lessons")).toBeTruthy();
  expect(screen.getByText("Exams completed")).toBeTruthy();

  expect(screen.getAllByText("No data yet")).toHaveLength(2);

  expect(screen.getByLabelText("Welcome aboard: earned")).toBeTruthy();
  expect(screen.getByLabelText("First lesson: locked")).toBeTruthy();
  expect(screen.getByLabelText("First exam: locked")).toBeTruthy();
  expect(screen.getByLabelText("On a roll: locked")).toBeTruthy();
});

test("renders a realistic fixture: hero trio, chart percentages, and all badges earned", async () => {
  mockGetMyStats.mockResolvedValue({
    current_streak_days: 12,
    longest_streak_days: 30,
    lessons_completed: 4,
    lessons_eligible: 10,
    exams_completed: 3,
    exam_average_score_percent: 82.5,
    questions_attempted: 50,
    questions_answered_lifetime: 64,
    question_accuracy_percent: 78,
  });

  renderScreen();

  expect(await screen.findByText("🔥 12 day streak")).toBeTruthy();
  expect(screen.getByText("4 of 10 lessons")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();

  expect(screen.getByText("83%")).toBeTruthy();
  expect(screen.getByText("78%")).toBeTruthy();

  expect(screen.getByLabelText("Welcome aboard: earned")).toBeTruthy();
  expect(screen.getByLabelText("First lesson: earned")).toBeTruthy();
  expect(screen.getByLabelText("First exam: earned")).toBeTruthy();
  expect(screen.getByLabelText("On a roll: earned")).toBeTruthy();
});
