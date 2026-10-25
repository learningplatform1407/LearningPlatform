import type { DailyQuestion, DailyQuestionCalendar } from "@lp/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import LearnScreen from "../index";

const mockListRecentLessons = jest.fn();
const mockGetDailyQuestion = jest.fn();
const mockGetDailyQuestionCalendar = jest.fn();
const mockGetDailyQuestionForDate = jest.fn();
const mockAnswerDailyQuestion = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    listRecentLessons: mockListRecentLessons,
    getDailyQuestion: mockGetDailyQuestion,
    getDailyQuestionCalendar: mockGetDailyQuestionCalendar,
    getDailyQuestionForDate: mockGetDailyQuestionForDate,
    answerDailyQuestion: mockAnswerDailyQuestion,
  }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

// Every date here comes from this, never from the clock — the same rule the
// components follow, so the suite stays green on any day.
const TODAY = "2026-10-13";

const QUESTION = {
  id: "q1",
  prompt: "Which of these are prime?",
  kind: "multi" as const,
  difficulty: "easy" as const,
  points_possible: 2,
  options: [
    { id: "o1", text: "2" },
    { id: "o2", text: "4" },
  ],
};

function emptyBank(): DailyQuestion {
  return { for_date: TODAY, server_today: TODAY, answerable: false, question: null, attempt: null };
}

function unanswered(): DailyQuestion {
  return {
    for_date: TODAY,
    server_today: TODAY,
    answerable: true,
    question: QUESTION,
    attempt: null,
  };
}

function answered(): DailyQuestion {
  return {
    for_date: TODAY,
    server_today: TODAY,
    answerable: false,
    question: QUESTION,
    attempt: {
      prompt: QUESTION.prompt,
      kind: QUESTION.kind,
      outcome: "correct",
      points_awarded: 2,
      points_possible: 2,
      explanation: "Only 2 is prime here.",
      options: [
        {
          id: "o1",
          text: "2",
          selected: true,
          in_key: true,
          classified_correctly: true,
          rationale: "Divisible only by 1 and itself.",
        },
        {
          id: "o2",
          text: "4",
          selected: false,
          in_key: false,
          classified_correctly: true,
          rationale: null,
        },
      ],
    },
  };
}

function calendar(days: DailyQuestionCalendar["days"] = []): DailyQuestionCalendar {
  return { server_today: TODAY, days };
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LearnScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  mockListRecentLessons.mockReset();
  mockGetDailyQuestion.mockReset();
  mockGetDailyQuestionCalendar.mockReset();
  mockGetDailyQuestionForDate.mockReset();
  mockAnswerDailyQuestion.mockReset();
  (router.push as jest.Mock).mockReset();
  // The dismissal marker is a real in-memory AsyncStorage here, so it would
  // otherwise leak between tests and silence the auto-open.
  await AsyncStorage.clear();

  // An empty bank by default: the quietest state, so a test that does not care
  // about the question of the day is not interrupted by its sheet.
  mockGetDailyQuestion.mockResolvedValue(emptyBank());
  mockGetDailyQuestionCalendar.mockResolvedValue(calendar());
});

test("shows Library, Question Bank, Flashcards, and Notebook when nothing has been viewed yet", async () => {
  mockListRecentLessons.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("Library")).toBeTruthy();
  expect(screen.getByText("Question Bank")).toBeTruthy();
  expect(screen.getByText("Flashcards")).toBeTruthy();
  expect(screen.getByText("Notebook")).toBeTruthy();
  expect(screen.queryByText("Continue where you left off")).toBeNull();
  expect(screen.queryByText("Recently opened")).toBeNull();
});

test("navigates to Library, Question Bank, Flashcards, and Notebook", async () => {
  mockListRecentLessons.mockResolvedValue([]);

  renderScreen();
  await screen.findByText("Library");

  fireEvent.press(screen.getByText("Library"));
  expect(router.push).toHaveBeenCalledWith("/learn/library");

  fireEvent.press(screen.getByText("Question Bank"));
  expect(router.push).toHaveBeenCalledWith("/question-bank");

  fireEvent.press(screen.getByText("Flashcards"));
  expect(router.push).toHaveBeenCalledWith("/learn/flashcards");

  fireEvent.press(screen.getByText("Notebook"));
  expect(router.push).toHaveBeenCalledWith("/learn/notebook");
});

test("shows the most recent lesson as Continue where you left off and navigates on press", async () => {
  mockListRecentLessons.mockResolvedValue([
    {
      id: "d1",
      title: "Latest lesson",
      created_at: "2026-01-01",
      status: "ready",
      last_viewed_at: "2026-09-08T12:00:00Z",
    },
  ]);

  renderScreen();

  expect(await screen.findByText("Continue where you left off")).toBeTruthy();
  fireEvent.press(screen.getByText("Latest lesson"));
  expect(router.push).toHaveBeenCalledWith("/learn/d1");
});

test("shows the rest as Recently opened, excluding the Continue lesson", async () => {
  mockListRecentLessons.mockResolvedValue([
    {
      id: "d1",
      title: "Most recent",
      created_at: "2026-01-01",
      status: "ready",
      last_viewed_at: "2026-09-08T12:00:00Z",
    },
    {
      id: "d2",
      title: "Second most recent",
      created_at: "2026-01-01",
      status: "ready",
      last_viewed_at: "2026-09-08T11:00:00Z",
    },
  ]);

  renderScreen();

  await screen.findByText("Continue where you left off");
  expect(screen.getByText("Recently opened")).toBeTruthy();
  expect(screen.getByText("Second most recent")).toBeTruthy();
  expect(screen.getAllByText("Most recent")).toHaveLength(1);
});

test("offers the question of the day even while the lessons query is still loading", async () => {
  // The sheet used to be impossible here: the screen returned early for
  // loading, so anything outside the success branch simply did not exist.
  mockListRecentLessons.mockReturnValue(new Promise(() => {}));
  mockGetDailyQuestion.mockResolvedValue(unanswered());

  renderScreen();

  expect(await screen.findByText("Which of these are prime?")).toBeTruthy();
});

test("auto-opens today's unanswered question", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestion.mockResolvedValue(unanswered());

  renderScreen();

  expect(await screen.findByText("Which of these are prime?")).toBeTruthy();
  expect(screen.getByText("Check answer")).toBeTruthy();
  expect(screen.getByText("Close")).toBeTruthy();
});

test("closes with Close, and does not auto-open again on a fresh mount", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestion.mockResolvedValue(unanswered());

  const first = renderScreen();
  await screen.findByText("Which of these are prime?");

  fireEvent.press(screen.getByText("Close"));
  // RN's Modal unmounts asynchronously, so this has to be awaited.
  await waitFor(() => expect(screen.queryByText("Check answer")).toBeNull());
  // Asserting the stored value, not that setItem was called: the official mock
  // backs these with a real in-memory store, so the value is the behaviour.
  await waitFor(async () => expect(await AsyncStorage.getItem("lp.qotd.dismissed")).toBe(TODAY));

  // Navigating away and back is a fresh mount, which is exactly the case the
  // stored marker exists to survive.
  first.unmount();
  renderScreen();

  await screen.findByText("Library");
  expect(screen.queryByText("Check answer")).toBeNull();
});

test("does not open before the dismissal marker has been read", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestion.mockResolvedValue(unanswered());
  // Hold the marker read open. The API query can win this race — a warm
  // response against a cold AsyncStorage — and an unread marker is
  // `undefined`, which compares unequal to today's date. Without the
  // isSuccess guard the sheet would open on someone who had already
  // dismissed it today.
  let release: (value: string | null) => void = () => {};
  // AsyncStorage's official jest mock is built out of jest.fn()s, so
  // jest.spyOn(...).mockRestore() here would hand back a *bare* mock and
  // silently break the in-memory store for every test that follows. Swap the
  // implementation and put the real one back by hand instead.
  const getItem = AsyncStorage.getItem as jest.Mock;
  const inMemoryGetItem = getItem.getMockImplementation();
  getItem.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );

  try {
    renderScreen();
    // The card proves today's question has arrived...
    await screen.findByText("Answer today's question.");
    // ...and the sheet is still shut, because the marker is unknown.
    expect(screen.queryByText("Check answer")).toBeNull();

    // Not suppressed, only deferred: once the marker says "not dismissed",
    // the question offers itself.
    release(null);
    expect(await screen.findByText("Check answer")).toBeTruthy();
  } finally {
    if (inMemoryGetItem) {
      getItem.mockImplementation(inMemoryGetItem);
    } else {
      getItem.mockReset();
    }
  }
});

test("the hub card reopens it after it was dismissed", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestion.mockResolvedValue(unanswered());
  await AsyncStorage.setItem("lp.qotd.dismissed", TODAY);

  renderScreen();

  await screen.findByText("Answer today's question.");
  expect(screen.queryByText("Check answer")).toBeNull();

  fireEvent.press(screen.getByText("Question of the day"));

  expect(await screen.findByText("Check answer")).toBeTruthy();
});

test("does not auto-open a day that was already answered", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestion.mockResolvedValue(answered());

  renderScreen();

  expect(await screen.findByText("Answered correctly, 2/2 points.")).toBeTruthy();
  expect(screen.queryByText("Close")).toBeNull();
});

test("stays quiet when the bank holds no question", async () => {
  mockListRecentLessons.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("No question today.")).toBeTruthy();
  expect(screen.queryByText("Close")).toBeNull();
});

test("a past day that was not answered shows the question with no way to answer", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestionCalendar.mockResolvedValue(
    calendar([{ for_date: "2026-10-09", answered: false, outcome: null }]),
  );
  mockGetDailyQuestionForDate.mockResolvedValue({
    for_date: "2026-10-09",
    server_today: TODAY,
    answerable: false,
    question: QUESTION,
    attempt: null,
  } satisfies DailyQuestion);

  renderScreen();
  // The bank is empty today, so nothing auto-opens; the card is the way in.
  fireEvent.press(await screen.findByText("Question of the day"));

  fireEvent.press(await screen.findByLabelText("Friday, October 9, 2026: not answered"));

  expect(await screen.findByText("Which of these are prime?")).toBeTruthy();
  expect(screen.getByText("This day has closed, so it can no longer be answered.")).toBeTruthy();
  expect(screen.queryByText("Check answer")).toBeNull();
  // No key, either: the server sends none for a day they did not answer.
  expect(screen.queryByText(" (correct answer)")).toBeNull();
});

test("answering keeps the sheet open, showing the score and reasoning", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  // The second read is what the invalidation refetches: answered, and so no
  // longer answerable. The sheet must survive that, or the score the learner
  // just earned flashes past them.
  mockGetDailyQuestion.mockResolvedValueOnce(unanswered()).mockResolvedValue(answered());
  mockAnswerDailyQuestion.mockResolvedValue(answered());

  renderScreen();
  await screen.findByText("Which of these are prime?");

  // By role, not by text: the calendar grid above also contains a cell
  // reading "2" (the second of the month).
  fireEvent.press(screen.getByRole("checkbox", { name: "2" }));
  fireEvent.press(screen.getByText("Check answer"));

  // No date is sent: the server decides which day an answer belongs to, so a
  // form left open across midnight cannot post yesterday.
  await waitFor(() => expect(mockAnswerDailyQuestion).toHaveBeenCalledWith("q1", ["o1"]));
  expect(await screen.findByText("correct — 2/2 points")).toBeTruthy();
  expect(screen.getByText("Divisible only by 1 and itself.")).toBeTruthy();
});

test("asks for every day the grid renders, not just the month", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestion.mockResolvedValue(unanswered());

  renderScreen();
  await screen.findByText("Check answer");

  // Six weeks, so October's grid also shows 28–30 September and early
  // November. Fetching only 1–31 October left those cells matching no row.
  await waitFor(() =>
    expect(mockGetDailyQuestionCalendar).toHaveBeenCalledWith({
      start: "2026-09-28",
      end: "2026-11-08",
    }),
  );
});

test("a padding day from a neighbouring month is pressable like any other", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestionCalendar.mockResolvedValue(
    calendar([{ for_date: "2026-09-29", answered: true, outcome: "correct" }]),
  );
  mockGetDailyQuestionForDate.mockResolvedValue({
    ...answered(),
    for_date: "2026-09-29",
  } satisfies DailyQuestion);

  renderScreen();
  // The bank is empty today, so nothing auto-opens; the card is the way in.
  fireEvent.press(await screen.findByText("Question of the day"));

  fireEvent.press(await screen.findByLabelText("Tuesday, September 29, 2026: Answered correctly"));

  await waitFor(() => expect(mockGetDailyQuestionForDate).toHaveBeenCalledWith("2026-09-29"));
  expect(await screen.findByText("correct — 2/2 points")).toBeTruthy();
});

test("closing an empty-bank day does not silence a question published later", async () => {
  mockListRecentLessons.mockResolvedValue([]);

  // The hub card still opens on a day with no question — it reports the
  // emptiness — so closing it must not mark today as already offered.
  const first = renderScreen();
  fireEvent.press(await screen.findByText("Question of the day"));
  await screen.findByText("There is no question today. Check back tomorrow.");
  fireEvent.press(screen.getByText("Close"));
  await waitFor(() => expect(screen.queryByText("Close")).toBeNull());
  expect(await AsyncStorage.getItem("lp.qotd.dismissed")).toBeNull();
  first.unmount();

  // An admin publishes one later the same day.
  mockGetDailyQuestion.mockResolvedValue(unanswered());
  renderScreen();

  expect(await screen.findByText("Check answer")).toBeTruthy();
});

test("a day the calendar has no row for is not pressable", async () => {
  mockListRecentLessons.mockResolvedValue([]);
  mockGetDailyQuestion.mockResolvedValue(unanswered());

  renderScreen();
  await screen.findByText("Check answer");

  // Days are drawn on demand and never backfilled, so a past date with no row
  // never had a question — asking for it would 404.
  expect(screen.queryByLabelText("Friday, October 9, 2026: not answered")).toBeNull();
  // Today is always pressable, because pressing it is what draws it.
  expect(screen.getByLabelText("Today, Tuesday, October 13, 2026: not answered")).toBeTruthy();
});
