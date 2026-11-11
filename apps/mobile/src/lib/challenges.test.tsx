import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ChallengeResult, ChallengeSender, ChallengesSection } from "./challenges";

const mockListFollowing = jest.fn();
const mockCreateChallenge = jest.fn();
const mockListChallenges = jest.fn();
const mockAcceptChallenge = jest.fn();
const mockDeclineChallenge = jest.fn();
const mockGetChallenge = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    listFollowing: mockListFollowing,
    createChallenge: mockCreateChallenge,
    listChallenges: mockListChallenges,
    acceptChallenge: mockAcceptChallenge,
    declineChallenge: mockDeclineChallenge,
    getChallenge: mockGetChallenge,
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
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
  mockListFollowing.mockReset().mockResolvedValue([
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
  mockCreateChallenge.mockReset().mockResolvedValue({ ...challenge, direction: "sent" });
  mockListChallenges.mockReset().mockResolvedValue([challenge]);
  mockAcceptChallenge.mockReset().mockResolvedValue({ id: "s2" });
  mockDeclineChallenge.mockReset().mockResolvedValue({ ...challenge, status: "declined" });
  mockGetChallenge.mockReset();
});

test("sending a finished exam to someone who follows you back", async () => {
  renderWithQuery(<ChallengeSender sessionId="s1" />);

  fireEvent.press(screen.getByText("Challenge someone"));

  expect(await screen.findByText("Bea")).toBeTruthy();
  expect(screen.queryByText("Cris")).toBeNull();
  fireEvent.press(screen.getByLabelText("Challenge Bea"));

  await waitFor(() =>
    expect(mockCreateChallenge).toHaveBeenCalledWith({ session_id: "s1", user_id: "u2" }),
  );
  expect(await screen.findByText("Challenge sent to Bea.")).toBeTruthy();
});

test("accepting and declining challenges sent to you", async () => {
  const onAccepted = jest.fn();
  renderWithQuery(<ChallengesSection onAccepted={onAccepted} onOpen={jest.fn()} />);

  expect(await screen.findByText("Bea challenged you to 10 questions")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Accept the challenge from Bea"));

  await waitFor(() => expect(mockAcceptChallenge).toHaveBeenCalledWith("c1"));
  await waitFor(() => expect(onAccepted).toHaveBeenCalled());

  fireEvent.press(screen.getByLabelText("Decline the challenge from Bea"));
  await waitFor(() => expect(mockDeclineChallenge).toHaveBeenCalledWith("c1"));
});

test("a finished challenge opens the comparison", async () => {
  mockListChallenges.mockResolvedValue([{ ...challenge, status: "completed" }]);
  const onOpen = jest.fn();
  renderWithQuery(<ChallengesSection onAccepted={jest.fn()} onOpen={onOpen} />);

  fireEvent.press(await screen.findByText("See result"));

  expect(onOpen).toHaveBeenCalledWith("c1");
});

test("the comparison shows both scores and the winner", async () => {
  mockGetChallenge.mockResolvedValue({
    ...challenge,
    status: "completed",
    your_score_percent: 50,
    opponent_score_percent: 60,
    questions: [{ position: 0, your_outcome: "incorrect", opponent_outcome: "correct" }],
  });
  renderWithQuery(<ChallengeResult challengeId="c1" onDone={jest.fn()} />);

  expect(await screen.findByText("You vs Bea")).toBeTruthy();
  expect(screen.getByText("Bea won")).toBeTruthy();
  expect(screen.getByText("50%")).toBeTruthy();
  expect(screen.getByText("60%")).toBeTruthy();
  expect(screen.getByText("You: incorrect · Bea: correct")).toBeTruthy();
});
