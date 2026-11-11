import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientError } from "@lp/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import PublicProfilePage from "./page";

const getMe = vi.fn();
const getUserProfile = vi.fn();
const followUser = vi.fn();
const unfollowUser = vi.fn();
const listUserActivity = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    getUserProfile,
    followUser,
    unfollowUser,
    listUserActivity,
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ userId: "u2" }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PublicProfilePage />
    </QueryClientProvider>,
  );
}

const me = {
  id: "u1",
  email: "ada@example.com",
  display_name: "Ada",
  avatar_url: null,
  university: null,
  role: "student",
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  settings: { theme: "system", notifications_enabled: true, language: "en", profile_public: true },
};

const bea = {
  id: "u2",
  display_name: "Bea",
  avatar_url: null,
  university: "UMF Iași",
  is_following: false,
  follows_you: false,
  created_at: "2026-03-02T00:00:00Z",
  followers_count: 4,
  following_count: 1,
  stats: {
    current_streak_days: 5,
    longest_streak_days: 9,
    lessons_completed: 3,
    lessons_eligible: 10,
    exams_completed: 2,
    exam_average_score_percent: 80,
    questions_attempted: 40,
    questions_answered_lifetime: 55,
    question_accuracy_percent: 72.5,
  },
};

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(me);
  getUserProfile.mockReset().mockResolvedValue(bea);
  followUser.mockReset().mockResolvedValue(undefined);
  unfollowUser.mockReset().mockResolvedValue(undefined);
  listUserActivity.mockReset().mockResolvedValue([]);
});

test("shows their recent activity", async () => {
  listUserActivity.mockResolvedValue([
    {
      id: "e1",
      kind: "exam_completed",
      created_at: "2026-10-09T12:00:00Z",
      user: { id: "u2", display_name: "Bea", avatar_url: null },
      document_id: null,
      document_title: null,
      score_percent: 90,
      question_count: 10,
      streak_days: null,
    },
  ]);
  renderPage();

  expect(await screen.findByText("Recent activity")).toBeInTheDocument();
  expect(await screen.findByText(/finished an exam with 90%/)).toBeInTheDocument();
  expect(listUserActivity).toHaveBeenCalledWith("u2");
});

test("shows who they are, their counts and their stats", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "Bea" })).toBeInTheDocument();
  expect(screen.getByText("UMF Iași · Joined March 2026")).toBeInTheDocument();
  expect(screen.getByText("4 followers")).toBeInTheDocument();
  expect(screen.getByText("1 following")).toBeInTheDocument();
  expect(screen.getByText("3 of 10 lessons")).toBeInTheDocument();
});

test("following updates the button and the follower count", async () => {
  followUser.mockImplementation(async () => {
    getUserProfile.mockResolvedValue({ ...bea, is_following: true, followers_count: 5 });
  });
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Follow Bea" }));

  expect(followUser).toHaveBeenCalledWith("u2");
  expect(await screen.findByRole("button", { name: "Unfollow Bea" })).toBeInTheDocument();
  expect(screen.getByText("5 followers")).toBeInTheDocument();
});

test("a private or unknown profile says so", async () => {
  getUserProfile.mockRejectedValue(new ApiClientError(404, { code: "user_not_found" }));
  renderPage();

  expect(await screen.findByText("This profile is private or doesn't exist.")).toBeInTheDocument();
});

test("your own profile has no follow button", async () => {
  getUserProfile.mockResolvedValue({ ...bea, id: "u1" });
  renderPage();

  await screen.findByRole("heading", { name: "Bea" });
  expect(screen.queryByRole("button", { name: /Follow/ })).not.toBeInTheDocument();
});
