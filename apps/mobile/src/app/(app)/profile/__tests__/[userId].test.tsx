import { ApiClientError } from "@lp/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import PublicProfileScreen from "../[userId]";

const mockGetMe = jest.fn();
const mockGetUserProfile = jest.fn();
const mockFollowUser = jest.fn();
const mockUnfollowUser = jest.fn();
const mockListUserActivity = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    getUserProfile: mockGetUserProfile,
    followUser: mockFollowUser,
    unfollowUser: mockUnfollowUser,
    listUserActivity: mockListUserActivity,
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ userId: "u2" }),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PublicProfileScreen />
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
  mockGetMe.mockReset().mockResolvedValue(me);
  mockGetUserProfile.mockReset().mockResolvedValue(bea);
  mockFollowUser.mockReset().mockResolvedValue(undefined);
  mockUnfollowUser.mockReset().mockResolvedValue(undefined);
  mockListUserActivity.mockReset().mockResolvedValue([]);
});

test("shows their recent activity", async () => {
  mockListUserActivity.mockResolvedValue([
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
  renderScreen();

  expect(await screen.findByText("Recent activity")).toBeTruthy();
  expect(await screen.findByText("Bea finished an exam with 90%")).toBeTruthy();
});

test("shows who they are, their counts and their stats", async () => {
  renderScreen();

  expect(await screen.findByText("Bea")).toBeTruthy();
  expect(screen.getByText("UMF Iași · Joined March 2026")).toBeTruthy();
  expect(screen.getByText("4 followers")).toBeTruthy();
  expect(screen.getByText("3 of 10 lessons")).toBeTruthy();
});

test("following flips the button", async () => {
  mockFollowUser.mockImplementation(async () => {
    mockGetUserProfile.mockResolvedValue({ ...bea, is_following: true, followers_count: 5 });
  });
  renderScreen();

  fireEvent.press(await screen.findByLabelText("Follow Bea"));

  await waitFor(() => expect(mockFollowUser).toHaveBeenCalledWith("u2"));
  expect(await screen.findByLabelText("Unfollow Bea")).toBeTruthy();
  expect(await screen.findByText("5 followers")).toBeTruthy();
});

test("a private or unknown profile says so", async () => {
  mockGetUserProfile.mockRejectedValue(new ApiClientError(404, { code: "user_not_found" }));
  renderScreen();

  expect(await screen.findByText("This profile is private or doesn't exist.")).toBeTruthy();
});
