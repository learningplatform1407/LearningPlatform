import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import QuizzesPage from "./page";

const getMe = vi.fn();
const getCurrentQuizSession = vi.fn();
const listQuizSessionHistory = vi.fn();
const listTags = vi.fn();
const getQuizAvailableCount = vi.fn();
const listQuestionBank = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    getCurrentQuizSession,
    listQuizSessionHistory,
    listTags,
    getQuizAvailableCount,
    listQuestionBank,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <QuizzesPage />
      </QueryClientProvider>,
    ),
  };
}

const openSession = {
  id: "s1",
  status: "active",
  reveal_mode: "on_finish",
  question_count: 1,
  duration_seconds: null,
  remaining_seconds: null,
  server_time: new Date().toISOString(),
  points_awarded: null,
  points_possible: null,
  finished_at: null,
  questions: [
    {
      position: 0,
      prompt: "Which drug lowers preload?",
      kind: "single",
      scoring_scheme: "single_4",
      points_possible: 4,
      options: [
        { id: "a", text: "Nitrates" },
        { id: "b", text: "Vasopressors" },
      ],
      selected_option_ids: null,
      answered_at: null,
      points_awarded: null,
      outcome: null,
    },
  ],
};

beforeEach(() => {
  getMe.mockReset();
  getCurrentQuizSession.mockReset().mockResolvedValue(null);
  listQuizSessionHistory.mockReset().mockResolvedValue([]);
  listTags.mockReset().mockResolvedValue([]);
  getQuizAvailableCount.mockReset().mockResolvedValue({ available: 2 });
  listQuestionBank.mockReset().mockResolvedValue([]);
});

test("shows the real pool size, not the overlapping per-tag counts", async () => {
  // Two questions each tagged cardiology AND pharmacology show as "(2)"
  // under both tags, which reads as four available questions.
  getMe.mockResolvedValue({ id: "u1", role: "student" });
  listTags.mockResolvedValue([
    { id: "t1", slug: "cardiology", label: "Cardiology", question_count: 2 },
    { id: "t2", slug: "pharmacology", label: "Pharmacology", question_count: 2 },
  ]);
  getQuizAvailableCount.mockResolvedValue({ available: 2 });

  renderPage();

  expect(await screen.findByText(/2 questions available/)).toBeInTheDocument();
});

test("blocks starting when the filter matches nothing", async () => {
  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getQuizAvailableCount.mockResolvedValue({ available: 0 });

  renderPage();

  expect(await screen.findByText("No published questions match this filter.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start quiz" })).toBeDisabled();
});

test("hides the import-questions link for a non-admin", async () => {
  getMe.mockResolvedValue({ id: "u1", role: "student" });

  renderPage();

  expect(await screen.findByRole("button", { name: "Start quiz" })).toBeInTheDocument();
  expect(screen.queryByText("Import questions →")).not.toBeInTheDocument();
});

test("shows the import-questions link for an admin", async () => {
  getMe.mockResolvedValue({ id: "u1", role: "admin" });

  renderPage();

  const link = await screen.findByRole("link", { name: "Import questions →" });
  expect(link).toHaveAttribute("href", "/question-bank/manage");
});

test("locks an already-answered question under immediate reveal", async () => {
  // Reopening the page loses the in-memory reveal state, but the answer is
  // final server-side — leaving Save enabled makes every click a guaranteed
  // already_answered 409.
  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getCurrentQuizSession.mockResolvedValue({
    ...openSession,
    reveal_mode: "immediate",
    questions: [
      {
        ...openSession.questions[0],
        selected_option_ids: ["a"],
        answered_at: new Date().toISOString(),
        points_awarded: 4,
        outcome: "correct",
      },
    ],
  });

  renderPage();

  expect(await screen.findByText(/Answered — correct \(4\/4 points\)/)).toBeInTheDocument();
  // Matches the old label too ("Answer saved ✓"), which was still a live
  // button that posted a second answer.
  expect(
    screen.queryByRole("button", { name: /Save answer|Answer saved/ }),
  ).not.toBeInTheDocument();
  for (const option of screen.getAllByRole("radio")) {
    expect(option).toBeDisabled();
  }
});

test("shows a resume-style runner when a session is already open", async () => {
  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getCurrentQuizSession.mockResolvedValue(openSession);

  renderPage();

  expect(await screen.findByText(/Which drug lowers preload\?/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit quiz" })).toBeInTheDocument();
});

// A server_time 30s in the past is what a ticking clock looks like without
// needing timers: an ACTIVE session must have burned those 30s, a PAUSED one
// must not have, because the server already banked its elapsed time. The old
// code subtracted the elapsed wall clock in both cases.
const THIRTY_SECONDS_AGO = () => new Date(Date.now() - 30_000).toISOString();

test("renders the server's remaining time on arrival", async () => {
  // The countdown is a render of the server's number, never an independent
  // clock; the interval then applies wall-clock drift on top of it each
  // second, and a refetch resets the baseline.
  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getCurrentQuizSession.mockResolvedValue({
    ...openSession,
    status: "active",
    duration_seconds: 1800,
    remaining_seconds: 600,
    server_time: THIRTY_SECONDS_AGO(),
  });

  renderPage();

  expect(await screen.findByText(/10:00/)).toBeInTheDocument();
});

test("freezes the countdown while paused", async () => {
  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getCurrentQuizSession.mockResolvedValue({
    ...openSession,
    status: "paused",
    duration_seconds: 1800,
    remaining_seconds: 600,
    server_time: THIRTY_SECONDS_AGO(),
  });

  renderPage();

  expect(await screen.findByText(/10:00 \(paused\)/)).toBeInTheDocument();
});

test("does not hand back the paused seconds on resume", async () => {
  // Pause at 29:48 with 1788s banked, wait 5s, resume. The server returns the
  // same 1788 and a fresh server_time, so the display must still read 29:48.
  // It previously read 29:53 — the clock lived in state advanced only by the
  // interval, which is stopped while paused, so it was 5s behind the new
  // server_time and the subtraction went negative.
  const base = Date.parse("2026-09-29T12:00:00.000Z");
  const clock = vi.spyOn(Date, "now").mockReturnValue(base);

  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getCurrentQuizSession.mockResolvedValue({
    ...openSession,
    status: "paused",
    duration_seconds: 1800,
    remaining_seconds: 1788,
    server_time: new Date(base).toISOString(),
  });

  const { queryClient } = renderPage();
  expect(await screen.findByText(/29:48 \(paused\)/)).toBeInTheDocument();

  clock.mockReturnValue(base + 5000);
  act(() => {
    queryClient.setQueryData(["quiz-session-current"], {
      ...openSession,
      status: "active",
      duration_seconds: 1800,
      remaining_seconds: 1788,
      server_time: new Date(base + 5000).toISOString(),
    });
  });

  expect(await screen.findByText(/29:48/)).toBeInTheDocument();
  expect(screen.queryByText(/29:5[0-9]/)).not.toBeInTheDocument();
  clock.mockRestore();
});

test("rebases the local clock when the server sends a new snapshot", async () => {
  // The seconds burned locally must reset when a refetch arrives, or a
  // resume subtracts the pre-pause elapsed a second time and shows too
  // little time left.
  const base = Date.parse("2026-09-29T12:00:00.000Z");
  vi.useFakeTimers({ now: base, shouldAdvanceTime: true });

  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getCurrentQuizSession.mockResolvedValue({
    ...openSession,
    status: "active",
    duration_seconds: 1800,
    remaining_seconds: 1788,
    server_time: new Date(base).toISOString(),
  });

  const { queryClient } = renderPage();
  expect(await screen.findByText(/29:48/)).toBeInTheDocument();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(12_000);
  });
  expect(screen.getByText(/29:36/)).toBeInTheDocument();

  // Paused for 5s, then resumed: the server banked 12s and re-bases from a
  // fresh server_time, so 29:36 is the truth again.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  const resumed = {
    ...openSession,
    status: "active",
    duration_seconds: 1800,
    remaining_seconds: 1776,
    server_time: new Date(base + 17_000).toISOString(),
  };
  // The mock has to move too: react-query refetches on its own here, and a
  // stale mock would clobber setQueryData with the pre-pause snapshot.
  getCurrentQuizSession.mockResolvedValue(resumed);
  act(() => {
    queryClient.setQueryData(["quiz-session-current"], resumed);
  });

  expect(await screen.findByText(/29:36/)).toBeInTheDocument();
  vi.useRealTimers();
});

test("keeps submit available while paused", async () => {
  // paused --> completed is a real transition; forcing a resume first would
  // restart the clock on a timed quiz.
  getMe.mockResolvedValue({ id: "u1", role: "student" });
  getCurrentQuizSession.mockResolvedValue({ ...openSession, status: "paused" });

  renderPage();

  expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit quiz" })).toBeEnabled();
});
