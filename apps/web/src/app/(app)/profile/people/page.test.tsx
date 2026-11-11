import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import PeoplePage from "./page";

const getMe = vi.fn();
const searchUsers = vi.fn();
const listFollowing = vi.fn();
const listFollowers = vi.fn();
const followUser = vi.fn();
const unfollowUser = vi.fn();
const removeFollower = vi.fn();
const listFollowingActivity = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    searchUsers,
    listFollowing,
    listFollowers,
    followUser,
    unfollowUser,
    removeFollower,
    listFollowingActivity,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PeoplePage />
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
  searchParams = new URLSearchParams();
  getMe.mockReset().mockResolvedValue(me);
  searchUsers.mockReset().mockResolvedValue([bea]);
  listFollowing.mockReset().mockResolvedValue([]);
  listFollowers.mockReset().mockResolvedValue([]);
  followUser.mockReset().mockResolvedValue(undefined);
  unfollowUser.mockReset().mockResolvedValue(undefined);
  removeFollower.mockReset().mockResolvedValue(undefined);
  listFollowingActivity.mockReset().mockResolvedValue([]);
});

function streakEvent(index: number) {
  return {
    id: `e${index}`,
    kind: "streak_milestone",
    created_at: `2026-10-${String(30 - index).padStart(2, "0")}T12:00:00Z`,
    user: { id: "u2", display_name: "Bea", avatar_url: null },
    document_id: null,
    document_title: null,
    score_percent: null,
    question_count: null,
    streak_days: 3,
  };
}

test("the activity tab pages back through older events", async () => {
  searchParams = new URLSearchParams("tab=activity");
  const firstPage = Array.from({ length: 20 }, (_, index) => streakEvent(index));
  listFollowingActivity.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([streakEvent(20)]);
  const user = userEvent.setup();
  renderPage();

  expect(await screen.findAllByText(/is on a 3-day streak/)).toHaveLength(20);
  await user.click(screen.getByRole("button", { name: "Load more" }));

  expect(await screen.findAllByText(/is on a 3-day streak/)).toHaveLength(21);
  expect(listFollowingActivity).toHaveBeenLastCalledWith({
    before: firstPage.at(-1)?.created_at,
    limit: 20,
  });
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

test("searching by name and following someone", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText("Search learners by name"), "bea");

  const row = (await screen.findByText("Bea Ionescu")).closest("li")!;
  expect(searchUsers).toHaveBeenCalledWith("bea");
  expect(within(row).getByText("Follows you")).toBeInTheDocument();
  expect(within(row).getByRole("link")).toHaveAttribute("href", "/profile/u2");

  await user.click(within(row).getByRole("button", { name: "Follow Bea Ionescu" }));

  expect(followUser).toHaveBeenCalledWith("u2");
  expect(
    await within(row).findByRole("button", { name: "Unfollow Bea Ionescu" }),
  ).toHaveTextContent("Following");
});

test("does not search until two letters are typed", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText("Search learners by name"), "b");

  expect(screen.getByText(/Type at least 2 letters/)).toBeInTheDocument();
  expect(searchUsers).not.toHaveBeenCalled();
});

test("opens on the tab named in the link, and can remove a follower", async () => {
  searchParams = new URLSearchParams("tab=followers");
  listFollowers.mockResolvedValue([bea]);
  const user = userEvent.setup();
  renderPage();

  await user.click(
    await screen.findByRole("button", { name: "Remove Bea Ionescu from your followers" }),
  );

  expect(removeFollower).toHaveBeenCalledWith("u2");
});

test("tells a private learner that nobody can find them", async () => {
  getMe.mockResolvedValue({ ...me, settings: { ...me.settings, profile_public: false } });
  renderPage();

  expect(await screen.findByText(/Your profile is private/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Change this in Privacy settings" })).toHaveAttribute(
    "href",
    "/settings/privacy",
  );
});

test("an empty following list says so", async () => {
  searchParams = new URLSearchParams("tab=following");
  renderPage();

  expect(await screen.findByText(/not following anyone yet/)).toBeInTheDocument();
});
