import type { DailyQuestion, DailyQuestionCalendar } from "@lp/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import LearnPage from "./page";

const listRecentLessons = vi.fn();
const getDailyQuestion = vi.fn();
const getDailyQuestionCalendar = vi.fn();
const getDailyQuestionForDate = vi.fn();
const answerDailyQuestion = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    listRecentLessons,
    getDailyQuestion,
    getDailyQuestionCalendar,
    getDailyQuestionForDate,
    answerDailyQuestion,
  }),
}));

// Every date in these tests comes from this, never from the clock — the same
// rule the components follow, so the suite stays green on any day.
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LearnPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listRecentLessons.mockReset();
  getDailyQuestion.mockReset();
  getDailyQuestionCalendar.mockReset();
  getDailyQuestionForDate.mockReset();
  answerDailyQuestion.mockReset();
  // The dismissal marker is real localStorage in jsdom, so it would otherwise
  // leak between tests and silence the auto-open.
  window.localStorage.clear();

  // An empty bank by default: the quietest state, so a test that does not care
  // about the question of the day is not interrupted by its overlay.
  getDailyQuestion.mockResolvedValue(emptyBank());
  getDailyQuestionCalendar.mockResolvedValue(calendar());
});

describe("LearnPage", () => {
  test("shows Library, Quizzes, Flashcards, and Notebook when nothing has been viewed yet", async () => {
    listRecentLessons.mockResolvedValue([]);

    renderPage();

    const libraryLink = await screen.findByRole("link", { name: /Library/ });
    expect(libraryLink).toHaveAttribute("href", "/learn/library");
    const quizzesLink = screen.getByRole("link", { name: /Question Bank/ });
    expect(quizzesLink).toHaveAttribute("href", "/question-bank");
    const flashcardsLink = screen.getByRole("link", { name: /Flashcards/ });
    expect(flashcardsLink).toHaveAttribute("href", "/learn/flashcards");
    const notebookLink = screen.getByRole("link", { name: /Notebook/ });
    expect(notebookLink).toHaveAttribute("href", "/learn/notebook");
    expect(screen.queryByText("Continue where you left off")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently opened")).not.toBeInTheDocument();
  });

  test("shows the most recent lesson as Continue where you left off", async () => {
    listRecentLessons.mockResolvedValue([
      {
        id: "d1",
        title: "Latest lesson",
        created_at: "2026-01-01",
        status: "ready",
        last_viewed_at: "2026-09-08T12:00:00Z",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Continue where you left off")).toBeInTheDocument();
    const continueLink = screen.getByRole("link", { name: /Latest lesson/ });
    expect(continueLink).toHaveAttribute("href", "/learn/d1");
  });

  test("shows the rest as Recently opened, excluding the Continue lesson", async () => {
    listRecentLessons.mockResolvedValue([
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

    renderPage();

    await screen.findByText("Continue where you left off");
    expect(screen.getByText("Recently opened")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Second most recent/ })).toBeInTheDocument();
    // "Most recent" only appears once — inside the Continue card, not duplicated below.
    expect(screen.getAllByText("Most recent")).toHaveLength(1);
  });

  test("renders the calendar rail even while the lessons query is still loading", async () => {
    // The rail used to be impossible here: each branch of the page returned its
    // own <main>, so anything outside the success branch simply did not exist.
    listRecentLessons.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Question of the day" })).toBeInTheDocument();
  });

  test("renders the calendar rail when the lessons query fails", async () => {
    listRecentLessons.mockRejectedValue(new Error("nope"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to load your recent lessons.",
    );
    expect(screen.getByRole("heading", { name: "Question of the day" })).toBeInTheDocument();
  });
});

describe("LearnPage question of the day", () => {
  test("auto-opens today's unanswered question", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestion.mockResolvedValue(unanswered());

    renderPage();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Question of the day");
    expect(screen.getByText("Which of these are prime?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check answer" })).toBeInTheDocument();
  });

  test("does not auto-open once it has been closed, even on a fresh mount", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestion.mockResolvedValue(unanswered());
    const user = userEvent.setup();

    const first = renderPage();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Navigating away and back is a fresh mount, which is exactly the case the
    // stored marker exists to survive.
    first.unmount();
    renderPage();

    await screen.findByRole("heading", { name: "Question of the day" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("stays closed even when the marker cannot be stored", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestion.mockResolvedValue(unanswered());
    // Safari in private mode throws on setItem. Auto-open is derived from the
    // marker, so without a latch on "the reader has taken control" a failed
    // write would re-derive as open and trap them in the overlay.
    //
    // The whole Storage is swapped rather than spying on setItem, because
    // `vi.spyOn(window.localStorage, "setItem")` does not work against real
    // jsdom: its Storage is a Proxy whose defineProperty trap stores a *key*
    // named "setItem" instead of installing the spy, leaving the prototype
    // method to run. The spy then never fires, so this test passed locally —
    // where vitest.setup.ts installs a plain object, Node 26 having shadowed
    // jsdom's localStorage — and failed on CI's Node 22. Defining on `window`
    // behaves identically in both.
    const real = window.localStorage;
    const setItem = vi.fn(() => {
      throw new DOMException("QuotaExceededError");
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        length: 0,
        clear: () => {},
        getItem: () => null,
        key: () => null,
        removeItem: () => {},
        setItem,
      },
    });
    const user = userEvent.setup();

    try {
      renderPage();
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Close" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      // The write really was attempted and really did throw, so the overlay
      // staying shut is the latch doing its job rather than a silent no-op.
      expect(setItem).toHaveBeenCalledWith("lp.qotd.dismissed", TODAY);
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: real });
    }
  });

  test("does not auto-open a day that was already answered", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestion.mockResolvedValue(answered());

    renderPage();

    // Twice: the rail and the nav card are both in the DOM — only CSS hides
    // one of them — and they must never disagree about today's state.
    expect(await screen.findAllByText("Answered correctly, 2/2 points.")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("stays quiet when the bank holds no question, without raising an error", async () => {
    listRecentLessons.mockResolvedValue([]);

    renderPage();

    expect(await screen.findAllByText("No question today.")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // An empty bank is not a failure — a fresh environment would otherwise
    // greet everyone with a red alert.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("reopens today from the calendar after it was dismissed", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestion.mockResolvedValue(unanswered());
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^Today, Tuesday, October 13, 2026/ }));

    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Question of the day");
    // Today is read through GET /v1/daily-question, the only endpoint that
    // draws the day when nobody has opened it yet. GET /{for_date} reads an
    // existing row and never materialises one, so routing today through it
    // would 404 until some other visitor happened to trigger the draw.
    expect(getDailyQuestionForDate).not.toHaveBeenCalled();
  });

  test("a past day that was not answered shows the question with no way to answer", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestionCalendar.mockResolvedValue(
      calendar([{ for_date: "2026-10-09", answered: false, outcome: null }]),
    );
    getDailyQuestionForDate.mockResolvedValue({
      for_date: "2026-10-09",
      server_today: TODAY,
      answerable: false,
      question: QUESTION,
      attempt: null,
    } satisfies DailyQuestion);
    const user = userEvent.setup();

    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Friday, October 9, 2026: not answered" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Friday, October 9, 2026");
    expect(screen.getByText("Which of these are prime?")).toBeInTheDocument();
    expect(
      screen.getByText("This day has closed, so it can no longer be answered."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check answer" })).not.toBeInTheDocument();
    // No key, either: the server sends none for a day they did not answer.
    expect(screen.queryByText("(correct answer)")).not.toBeInTheDocument();
  });

  test("a past day that was answered shows the score and the reasoning", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestionCalendar.mockResolvedValue(
      calendar([{ for_date: "2026-10-09", answered: true, outcome: "correct" }]),
    );
    getDailyQuestionForDate.mockResolvedValue({
      ...answered(),
      for_date: "2026-10-09",
    } satisfies DailyQuestion);
    const user = userEvent.setup();

    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Friday, October 9, 2026: Answered correctly" }),
    );

    await screen.findByRole("dialog");
    expect(screen.getByText("correct — 2/2 points")).toBeInTheDocument();
    expect(screen.getByText("Divisible only by 1 and itself.")).toBeInTheDocument();
    expect(screen.getByText("Only 2 is prime here.")).toBeInTheDocument();
  });

  test("answering today posts the selection with no date attached", async () => {
    listRecentLessons.mockResolvedValue([]);
    getDailyQuestion.mockResolvedValue(unanswered());
    answerDailyQuestion.mockResolvedValue(answered());
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    // The server decides which day an answer belongs to, so a form left open
    // across midnight cannot post yesterday.
    await waitFor(() => expect(answerDailyQuestion).toHaveBeenCalledWith("q1", ["o1"]));
    expect(answerDailyQuestion).toHaveBeenCalledTimes(1);
  });

  test("keeps the overlay open after answering, showing the score and reasoning", async () => {
    listRecentLessons.mockResolvedValue([]);
    // The second read is what the invalidation refetches: answered, and so no
    // longer answerable. The overlay must survive that, or the score the
    // learner just earned flashes past them.
    getDailyQuestion.mockResolvedValueOnce(unanswered()).mockResolvedValue(answered());
    answerDailyQuestion.mockResolvedValue(answered());
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByText("correct — 2/2 points")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Divisible only by 1 and itself.")).toBeInTheDocument();
  });

  test("a day the calendar has no row for is not clickable", async () => {
    listRecentLessons.mockResolvedValue([]);

    renderPage();

    await screen.findByRole("heading", { name: "Question of the day" });
    // Days are drawn on demand and never backfilled, so a past date with no
    // row never had a question — asking for it would 404.
    expect(
      screen.queryByRole("button", { name: /Friday, October 9, 2026/ }),
    ).not.toBeInTheDocument();
    // Today is always clickable, because clicking it is what draws it.
    expect(
      screen.getByRole("button", { name: /^Today, Tuesday, October 13, 2026/ }),
    ).toBeInTheDocument();
  });

  test("asks for every day it renders, not just the month, and will not page into the future", async () => {
    listRecentLessons.mockResolvedValue([]);
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("heading", { name: "Question of the day" });
    // The grid is six weeks, so October's view also shows 28–30 September and
    // the start of November. Fetching only 1–31 October left those cells
    // matching no row: a day answered on the 29th rendered inert and unmarked
    // here, but marked once you paged back to September.
    await waitFor(() =>
      expect(getDailyQuestionCalendar).toHaveBeenCalledWith({
        start: "2026-09-28",
        end: "2026-11-08",
      }),
    );

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(await screen.findByText("September 2026")).toBeInTheDocument();
    await waitFor(() =>
      expect(getDailyQuestionCalendar).toHaveBeenCalledWith({
        start: "2026-08-31",
        end: "2026-10-11",
      }),
    );
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });

  test("a padding day from a neighbouring month is openable like any other", async () => {
    listRecentLessons.mockResolvedValue([]);
    // 29 September is rendered inside October's grid. It is a real answered
    // day, so it must carry its outcome and open — the defect was that no
    // padding cell ever could.
    getDailyQuestionCalendar.mockResolvedValue(
      calendar([{ for_date: "2026-09-29", answered: true, outcome: "correct" }]),
    );
    getDailyQuestionForDate.mockResolvedValue({
      ...answered(),
      for_date: "2026-09-29",
    } satisfies DailyQuestion);
    const user = userEvent.setup();

    renderPage();
    await user.click(
      await screen.findByRole("button", {
        name: "Tuesday, September 29, 2026: Answered correctly",
      }),
    );

    await screen.findByRole("dialog");
    expect(getDailyQuestionForDate).toHaveBeenCalledWith("2026-09-29");
    expect(screen.getByText("correct — 2/2 points")).toBeInTheDocument();
  });

  test("closing an empty-bank day does not silence a question published later", async () => {
    listRecentLessons.mockResolvedValue([]);
    const user = userEvent.setup();

    // The card still opens on a day with no question — it reports the
    // emptiness — so closing it must not mark today as already offered.
    const first = renderPage();
    await user.click(await screen.findByRole("button", { name: /Question of the day/ }));
    await screen.findByText("There is no question today. Check back tomorrow.");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    first.unmount();

    // An admin publishes one later the same day.
    getDailyQuestion.mockResolvedValue(unanswered());
    renderPage();

    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Question of the day");
  });
});
