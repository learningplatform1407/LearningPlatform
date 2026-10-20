import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import ProfilePage from "./page";

const getMe = vi.fn();
const getMyStats = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, getMyStats }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
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
  getMe.mockReset().mockResolvedValue(me);
  getMyStats.mockReset().mockResolvedValue(zeroStats);
});

test("shows the read-only header: display name and joined date", async () => {
  renderPage();

  expect(await screen.findByText("Ada")).toBeInTheDocument();
  expect(screen.getByText("Joined January 2026")).toBeInTheDocument();
  // No editable fields on this page any more.
  expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
});

test("the Edit Profile link points at the new settings page", async () => {
  renderPage();

  const link = await screen.findByRole("link", { name: "Edit Profile" });
  expect(link).toHaveAttribute("href", "/settings/profile");
});

test("shows a load error", async () => {
  getMe.mockRejectedValue(new Error("boom"));

  renderPage();

  expect(await screen.findByText(/Failed to load profile: boom/)).toBeInTheDocument();
});

test("the stats section shows its own loading state without blocking identity", async () => {
  getMyStats.mockImplementation(() => new Promise(() => {}));

  renderPage();

  expect(await screen.findByText("Ada")).toBeInTheDocument();
  expect(screen.getByText("Loading stats...")).toBeInTheDocument();
});

test("renders the zero-state hero trio, chart, and only the joined badge earned", async () => {
  renderPage();

  expect(await screen.findByText("No streak yet")).toBeInTheDocument();
  expect(screen.getByText("0 of 0 lessons")).toBeInTheDocument();
  expect(screen.getByText("Exams completed")).toBeInTheDocument();

  expect(screen.getAllByText("No data yet")).toHaveLength(2);

  expect(screen.getByLabelText("Welcome aboard: earned")).toBeInTheDocument();
  expect(screen.getByLabelText("First lesson: locked")).toBeInTheDocument();
  expect(screen.getByLabelText("First exam: locked")).toBeInTheDocument();
  expect(screen.getByLabelText("On a roll: locked")).toBeInTheDocument();
});

test("renders a realistic fixture: hero trio, chart percentages, and all badges earned", async () => {
  getMyStats.mockResolvedValue({
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

  renderPage();

  expect(await screen.findByText("🔥 12 day streak")).toBeInTheDocument();
  expect(screen.getByText("4 of 10 lessons")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();

  // MetricBarChart rounds for display: 82.5 -> 83.
  expect(screen.getByText("83%")).toBeInTheDocument();
  expect(screen.getByText("78%")).toBeInTheDocument();

  expect(screen.getByLabelText("Welcome aboard: earned")).toBeInTheDocument();
  expect(screen.getByLabelText("First lesson: earned")).toBeInTheDocument();
  expect(screen.getByLabelText("First exam: earned")).toBeInTheDocument();
  expect(screen.getByLabelText("On a roll: earned")).toBeInTheDocument();
});
