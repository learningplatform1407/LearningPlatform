import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import ExamsScreen from "../exams";

const mockGetQuestionBankTree = jest.fn();
const mockListTags = jest.fn();
const mockGetQuizAvailableCount = jest.fn();
const mockStartQuizSession = jest.fn();
const mockGetCurrentQuizSession = jest.fn();
const mockAnswerQuizQuestion = jest.fn();
const mockPauseQuizSession = jest.fn();
const mockResumeQuizSession = jest.fn();
const mockCancelQuizSession = jest.fn();
const mockSubmitQuizSession = jest.fn();
const mockGetQuizResults = jest.fn();
const mockListQuizSessionHistory = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getQuestionBankTree: mockGetQuestionBankTree,
    listTags: mockListTags,
    getQuizAvailableCount: mockGetQuizAvailableCount,
    startQuizSession: mockStartQuizSession,
    getCurrentQuizSession: mockGetCurrentQuizSession,
    answerQuizQuestion: mockAnswerQuizQuestion,
    pauseQuizSession: mockPauseQuizSession,
    resumeQuizSession: mockResumeQuizSession,
    cancelQuizSession: mockCancelQuizSession,
    submitQuizSession: mockSubmitQuizSession,
    getQuizResults: mockGetQuizResults,
    listQuizSessionHistory: mockListQuizSessionHistory,
  }),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExamsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGetQuestionBankTree.mockReset().mockResolvedValue({
    books: [],
    uncategorized_lessons: [],
    unassigned_question_count: 0,
    unassigned_answered_count: 0,
  });
  mockListTags.mockReset().mockResolvedValue([]);
  mockGetQuizAvailableCount.mockReset().mockResolvedValue({ available: 5 });
  mockStartQuizSession.mockReset();
  mockGetCurrentQuizSession.mockReset();
  mockAnswerQuizQuestion.mockReset();
  mockPauseQuizSession.mockReset();
  mockResumeQuizSession.mockReset();
  mockCancelQuizSession.mockReset();
  mockSubmitQuizSession.mockReset();
  mockGetQuizResults.mockReset();
  mockListQuizSessionHistory.mockReset().mockResolvedValue([]);
});

test("shows the start form and starts a quiz with the entered settings", async () => {
  mockGetCurrentQuizSession.mockResolvedValue(null);
  mockStartQuizSession.mockResolvedValue({});

  renderScreen();

  expect(await screen.findByText("Start quiz")).toBeTruthy();
  expect(await screen.findByText("5 questions available — you'll get all 5")).toBeTruthy();

  fireEvent.press(screen.getByText("Start quiz"));

  await waitFor(() => expect(mockStartQuizSession).toHaveBeenCalled());
  expect(mockStartQuizSession).toHaveBeenCalledWith({
    chapter_ids: [],
    sub_chapter_ids: [],
    document_ids: [],
    tag_ids: [],
    question_count: 10,
    duration_seconds: null,
    reveal_mode: "immediate",
  });
});

test("shows a running session with its first question and saves an answer", async () => {
  mockGetCurrentQuizSession.mockResolvedValue({
    id: "session-1",
    status: "active",
    reveal_mode: "immediate",
    question_count: 1,
    duration_seconds: null,
    remaining_seconds: null,
    server_time: "2026-01-01T00:00:00Z",
    points_awarded: null,
    points_possible: null,
    finished_at: null,
    questions: [
      {
        position: 0,
        prompt: "What is 2 + 2?",
        kind: "single",
        scoring_scheme: "all_or_nothing",
        points_possible: 1,
        options: [
          { id: "o1", text: "3" },
          { id: "o2", text: "4" },
        ],
        selected_option_ids: null,
        answered_at: null,
        points_awarded: null,
        outcome: null,
      },
    ],
  });
  mockAnswerQuizQuestion.mockResolvedValue({
    position: 0,
    prompt: "What is 2 + 2?",
    kind: "single",
    points_awarded: 1,
    points_possible: 1,
    outcome: "correct",
    explanation: null,
    options: [
      {
        id: "o1",
        text: "3",
        in_key: false,
        selected: false,
        classified_correctly: false,
        rationale: null,
      },
      {
        id: "o2",
        text: "4",
        in_key: true,
        selected: true,
        classified_correctly: true,
        rationale: null,
      },
    ],
  });

  renderScreen();

  expect(await screen.findByText("1. What is 2 + 2?")).toBeTruthy();

  fireEvent.press(screen.getByText("4"));
  fireEvent.press(screen.getByText("Save answer"));

  expect(await screen.findByText("Answers · correct — 1/1 points")).toBeTruthy();
  expect(mockAnswerQuizQuestion).toHaveBeenCalledWith("session-1", 0, ["o2"]);
});

test("shows results for a finished attempt", async () => {
  mockGetCurrentQuizSession.mockResolvedValue(null);
  mockListQuizSessionHistory.mockResolvedValue([
    {
      id: "session-2",
      status: "completed",
      reveal_mode: "immediate",
      question_count: 1,
      points_awarded: 1,
      points_possible: 1,
      finished_at: "2026-01-01T00:05:00Z",
      created_at: "2026-01-01T00:00:00Z",
    },
  ]);
  mockGetQuizResults.mockResolvedValue({
    id: "session-2",
    status: "completed",
    reveal_mode: "immediate",
    points_awarded: 1,
    points_possible: 1,
    finished_at: "2026-01-01T00:05:00Z",
    questions: [
      {
        position: 0,
        prompt: "What is 2 + 2?",
        kind: "single",
        points_awarded: 1,
        points_possible: 1,
        outcome: "correct",
        explanation: null,
        options: [
          {
            id: "o2",
            text: "4",
            in_key: true,
            selected: true,
            classified_correctly: true,
            rationale: null,
          },
        ],
      },
    ],
  });

  renderScreen();

  fireEvent.press(await screen.findByText(/completed · 1\/1 points · 1 question/));

  expect(await screen.findByText("1 / 1 points")).toBeTruthy();
});

function sessionWith(overrides: Record<string, unknown>) {
  return {
    id: "session-3",
    status: "active",
    reveal_mode: "on_finish",
    question_count: 1,
    duration_seconds: null,
    remaining_seconds: null,
    server_time: "2026-01-01T00:00:00Z",
    points_awarded: null,
    points_possible: null,
    finished_at: null,
    questions: [
      {
        position: 0,
        prompt: "Pick one",
        kind: "single",
        scoring_scheme: "all_or_nothing",
        points_possible: 1,
        options: [{ id: "o1", text: "Only option" }],
        selected_option_ids: null,
        answered_at: null,
        points_awarded: null,
        outcome: null,
      },
    ],
    ...overrides,
  };
}

test("an out-of-range question count disables Start", async () => {
  mockGetCurrentQuizSession.mockResolvedValue(null);

  renderScreen();

  fireEvent.changeText(await screen.findByDisplayValue("10"), "0");

  expect(await screen.findByText("Between 1 and 100 questions.")).toBeTruthy();
  fireEvent.press(screen.getByText("Start quiz"));
  expect(mockStartQuizSession).not.toHaveBeenCalled();
});

test("submitting with unanswered questions asks first", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockGetCurrentQuizSession.mockResolvedValue(sessionWith({}));

  renderScreen();

  fireEvent.press(await screen.findByText("Submit quiz"));

  expect(alert).toHaveBeenCalledWith(
    "Submit the quiz?",
    "1 question is not answered and will score 0.",
    expect.any(Array),
  );
  expect(mockSubmitQuizSession).not.toHaveBeenCalled();
  alert.mockRestore();
});

test("when the time runs out the results are shown", async () => {
  jest.useFakeTimers();
  mockGetCurrentQuizSession.mockResolvedValue(
    sessionWith({ duration_seconds: 60, remaining_seconds: 1 }),
  );
  mockGetQuizResults.mockResolvedValue({
    id: "session-3",
    status: "expired",
    reveal_mode: "on_finish",
    points_awarded: 0,
    points_possible: 1,
    finished_at: "2026-01-01T00:01:00Z",
    questions: [],
  });

  renderScreen();

  expect(await screen.findByText("Pick one", { exact: false })).toBeTruthy();
  act(() => {
    jest.advanceTimersByTime(3000);
  });

  expect(await screen.findByText("0 / 1 points")).toBeTruthy();
  expect(mockGetQuizResults).toHaveBeenCalledWith("session-3");
  jest.useRealTimers();
});
