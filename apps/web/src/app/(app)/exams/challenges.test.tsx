import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { ChallengeResult, ChallengeSender, ChallengesSection } from "./challenges";

const listFollowing = vi.fn();
const createChallenge = vi.fn();
const listChallenges = vi.fn();
const acceptChallenge = vi.fn();
const declineChallenge = vi.fn();
const getChallenge = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    listFollowing,
    createChallenge,
    listChallenges,
    acceptChallenge,
    declineChallenge,
    getChallenge,
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const bea = { id: "u2", display_name: "Bea", avatar_url: null };

const challenge = {
  id: "c1",
  status: "pending",
  direction: "incoming",
  opponent: bea,
  question_count: 10,
  duration_seconds: null,
  created_at: "2026-10-09T12:00:00Z",
  expires_at: "2026-10-16T12:00:00Z",
  completed_at: null,
  your_session_id: null,
  your_score_percent: null,
  opponent_score_percent: null,
  questions: null,
};

beforeEach(() => {
  listFollowing.mockReset().mockResolvedValue([
    { ...bea, university: null, is_following: true, follows_you: true },
    {
      id: "u3",
      display_name: "Cris",
      avatar_url: null,
      university: null,
      is_following: true,
      follows_you: false,
    },
  ]);
  createChallenge.mockReset().mockResolvedValue({ ...challenge, direction: "sent" });
  listChallenges.mockReset().mockResolvedValue([challenge]);
  acceptChallenge.mockReset().mockResolvedValue({ id: "s2" });
  declineChallenge.mockReset().mockResolvedValue({ ...challenge, status: "declined" });
  getChallenge.mockReset();
});

test("sending a finished exam to someone who follows you back", async () => {
  const user = userEvent.setup();
  renderWithQuery(<ChallengeSender sessionId="s1" />);

  await user.click(screen.getByRole("button", { name: "Challenge someone" }));

  // Only mutual follows can be challenged: Cris doesn't follow back.
  expect(await screen.findByText("Bea")).toBeInTheDocument();
  expect(screen.queryByText("Cris")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Challenge Bea" }));

  expect(createChallenge).toHaveBeenCalledWith({ session_id: "s1", user_id: "u2" });
  expect(await screen.findByRole("status")).toHaveTextContent("Challenge sent to Bea.");
});

test("with nobody following back, it says how challenges work", async () => {
  listFollowing.mockResolvedValue([]);
  const user = userEvent.setup();
  renderWithQuery(<ChallengeSender sessionId="s1" />);

  await user.click(screen.getByRole("button", { name: "Challenge someone" }));

  expect(await screen.findByText(/between people who follow each other/)).toBeInTheDocument();
});

test("accepting a challenge starts the attempt", async () => {
  const onAccepted = vi.fn();
  const user = userEvent.setup();
  renderWithQuery(<ChallengesSection onAccepted={onAccepted} onOpen={vi.fn()} />);

  const row = (await screen.findByText("Bea challenged you to 10 questions")).closest("li")!;
  await user.click(within(row).getByRole("button", { name: "Accept the challenge from Bea" }));

  expect(acceptChallenge).toHaveBeenCalledWith("c1");
  expect(onAccepted).toHaveBeenCalled();
});

test("declining a challenge", async () => {
  const user = userEvent.setup();
  renderWithQuery(<ChallengesSection onAccepted={vi.fn()} onOpen={vi.fn()} />);

  await user.click(await screen.findByRole("button", { name: "Decline the challenge from Bea" }));

  expect(declineChallenge).toHaveBeenCalledWith("c1");
});

test("a finished challenge opens the comparison; a sent one shows its state", async () => {
  listChallenges.mockResolvedValue([
    { ...challenge, id: "c2", status: "completed" },
    { ...challenge, id: "c3", direction: "sent" },
  ]);
  const onOpen = vi.fn();
  const user = userEvent.setup();
  renderWithQuery(<ChallengesSection onAccepted={vi.fn()} onOpen={onOpen} />);

  expect(await screen.findByText("You challenged Bea to 10 questions")).toBeInTheDocument();
  expect(screen.getByText("Waiting")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "See result" }));

  expect(onOpen).toHaveBeenCalledWith("c2");
});

test("there is no section until there is a challenge", async () => {
  listChallenges.mockResolvedValue([]);
  renderWithQuery(<ChallengesSection onAccepted={vi.fn()} onOpen={vi.fn()} />);

  await vi.waitFor(() => expect(listChallenges).toHaveBeenCalled());
  expect(screen.queryByText("Challenges")).not.toBeInTheDocument();
});

test("the comparison shows both scores, the winner and each question", async () => {
  getChallenge.mockResolvedValue({
    ...challenge,
    status: "completed",
    your_score_percent: 80,
    opponent_score_percent: 60,
    questions: [
      { position: 0, your_outcome: "correct", opponent_outcome: "incorrect" },
      { position: 1, your_outcome: null, opponent_outcome: "correct" },
    ],
  });
  renderWithQuery(<ChallengeResult challengeId="c1" onDone={vi.fn()} />);

  expect(await screen.findByRole("heading", { name: "You vs Bea" })).toBeInTheDocument();
  expect(screen.getByText("You won")).toBeInTheDocument();
  expect(screen.getByText("80%")).toBeInTheDocument();
  expect(screen.getByText("60%")).toBeInTheDocument();
  const rows = screen.getAllByRole("row");
  expect(rows[1]).toHaveTextContent("Question 1correctincorrect");
  expect(rows[2]).toHaveTextContent("Question 2No answercorrect");
});
