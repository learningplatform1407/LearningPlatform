import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

import PeopleScreen from "../people";

const mockGetMe = jest.fn();
const mockSearchUsers = jest.fn();
const mockListFollowing = jest.fn();
const mockListFollowers = jest.fn();
const mockFollowUser = jest.fn();
const mockUnfollowUser = jest.fn();
const mockRemoveFollower = jest.fn();
const mockPush = jest.fn();
let mockParams: { tab?: string } = {};

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    searchUsers: mockSearchUsers,
    listFollowing: mockListFollowing,
    listFollowers: mockListFollowers,
    followUser: mockFollowUser,
    unfollowUser: mockUnfollowUser,
    removeFollower: mockRemoveFollower,
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => mockParams,
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PeopleScreen />
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
  display_name: "Bea Ionescu",
  avatar_url: null,
  university: "UMF Iași",
  is_following: false,
  follows_you: true,
};

beforeEach(() => {
  mockParams = {};
  mockGetMe.mockReset().mockResolvedValue(me);
  mockSearchUsers.mockReset().mockResolvedValue([bea]);
  mockListFollowing.mockReset().mockResolvedValue([]);
  mockListFollowers.mockReset().mockResolvedValue([]);
  mockFollowUser.mockReset().mockResolvedValue(undefined);
  mockUnfollowUser.mockReset().mockResolvedValue(undefined);
  mockRemoveFollower.mockReset().mockResolvedValue(undefined);
  mockPush.mockReset();
});

test("searching by name, following someone and opening their profile", async () => {
  renderScreen();

  fireEvent.changeText(screen.getByLabelText("Search learners by name"), "bea");

  expect(await screen.findByText("Bea Ionescu")).toBeTruthy();
  expect(mockSearchUsers).toHaveBeenCalledWith("bea");
  expect(screen.getByText("Follows you")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Follow Bea Ionescu"));
  await waitFor(() => expect(mockFollowUser).toHaveBeenCalledWith("u2"));
  expect(await screen.findByLabelText("Unfollow Bea Ionescu")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Bea Ionescu"));
  expect(mockPush).toHaveBeenCalledWith("/profile/u2");
});

test("does not search until two letters are typed", () => {
  renderScreen();

  fireEvent.changeText(screen.getByLabelText("Search learners by name"), "b");

  expect(screen.getByText(/Type at least 2 letters/)).toBeTruthy();
  expect(mockSearchUsers).not.toHaveBeenCalled();
});

test("opens on the tab named in the link, and can remove a follower", async () => {
  mockParams = { tab: "followers" };
  mockListFollowers.mockResolvedValue([bea]);
  renderScreen();

  fireEvent.press(await screen.findByLabelText("Remove Bea Ionescu from your followers"));

  await waitFor(() => expect(mockRemoveFollower).toHaveBeenCalledWith("u2"));
});

test("tells a private learner that nobody can find them", async () => {
  mockGetMe.mockResolvedValue({ ...me, settings: { ...me.settings, profile_public: false } });
  renderScreen();

  fireEvent.press(await screen.findByText(/Your profile is private/));
  expect(mockPush).toHaveBeenCalledWith("/settings/privacy");
});

test("an empty following list says so", async () => {
  mockParams = { tab: "following" };
  renderScreen();

  expect(await screen.findByText(/not following anyone yet/)).toBeTruthy();
  expect(within(screen.root).queryByText("Bea Ionescu")).toBeNull();
});
