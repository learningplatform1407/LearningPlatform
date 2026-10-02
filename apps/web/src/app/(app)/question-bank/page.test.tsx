import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import QuestionBankPage from "./page";

const getMe = vi.fn();
const getQuestionBankTree = vi.fn();
const listQuestionBank = vi.fn();
const getQuizAvailableCount = vi.fn();
const answerBankQuestion = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    getQuestionBankTree,
    listQuestionBank,
    getQuizAvailableCount,
    answerBankQuestion,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <QuestionBankPage />
    </QueryClientProvider>,
  );
}

const emptyTree = {
  books: [],
  uncategorized_lessons: [],
  unassigned_question_count: 0,
  unassigned_answered_count: 0,
  unassigned_correct_count: 0,
  unassigned_partial_count: 0,
  unassigned_incorrect_count: 0,
  unassigned_points_awarded: 0,
  unassigned_points_possible: 0,
};

const question = {
  id: "q1",
  prompt: "Which drug lowers preload?",
  kind: "single",
  difficulty: "medium",
  points_possible: 4,
  document_id: "l1",
  options: [
    { id: "a", text: "Nitrates" },
    { id: "b", text: "Vasopressors" },
  ],
  tags: [],
  progress: null,
};

beforeEach(() => {
  getMe.mockReset().mockResolvedValue({ id: "u1", role: "student" });
  getQuestionBankTree.mockReset().mockResolvedValue(emptyTree);
  listQuestionBank.mockReset().mockResolvedValue([]);
  getQuizAvailableCount.mockReset().mockResolvedValue({ available: 0 });
  answerBankQuestion.mockReset();
});

test("shows progress counts down the tree", async () => {
  getQuestionBankTree.mockResolvedValue({
    ...emptyTree,
    books: [
      {
        id: "b1",
        title: "Cardiology",
        question_count: 5,
        answered_count: 2,
        chapters: [
          {
            id: "c1",
            title: "Heart failure",
            question_count: 5,
            answered_count: 2,
            sub_chapters: [],
          },
        ],
      },
    ],
  });

  renderPage();

  expect(await screen.findByText("Cardiology")).toBeInTheDocument();
  expect(screen.getByLabelText("2 of 5 answered")).toBeInTheDocument();
});

test("surfaces questions that belong to no lesson", async () => {
  // document_id is nullable, so these hang under no tree node. Without their
  // own row they would be unreachable from the bank entirely.
  getQuestionBankTree.mockResolvedValue({
    ...emptyTree,
    unassigned_question_count: 2,
    unassigned_answered_count: 1,
  });

  renderPage();

  expect(await screen.findByText("Questions not linked to a lesson")).toBeInTheDocument();
  expect(screen.getByLabelText("1 of 2 answered")).toBeInTheDocument();
});

test("reports the real total rather than the page shown", async () => {
  // The list endpoint pages at 50, so its length is what's rendered, not what
  // exists — saying "1 question" when the bank holds 137 is a lie.
  getQuestionBankTree.mockResolvedValue({
    ...emptyTree,
    uncategorized_lessons: [
      { id: "l1", title: "Loose lesson", question_count: 137, answered_count: 0 },
    ],
  });
  listQuestionBank.mockResolvedValue([question]);
  getQuizAvailableCount.mockResolvedValue({ available: 137 });

  const user = userEvent.setup();
  renderPage();
  // The lesson sits inside the collapsed Uncategorized parent.
  await user.click(await screen.findByRole("button", { name: /Uncategorized lessons/ }));
  await user.click(await screen.findByRole("button", { name: /Loose lesson/ }));

  expect(await screen.findByText("Showing 1 of 137 questions")).toBeInTheDocument();
});

test("answering a question reveals both scoring axes", async () => {
  getQuestionBankTree.mockResolvedValue({
    ...emptyTree,
    uncategorized_lessons: [
      { id: "l1", title: "Loose lesson", question_count: 1, answered_count: 0 },
    ],
  });
  listQuestionBank.mockResolvedValue([question]);
  getQuizAvailableCount.mockResolvedValue({ available: 1 });
  answerBankQuestion.mockResolvedValue({
    prompt: question.prompt,
    kind: "single",
    points_awarded: 4,
    points_possible: 4,
    outcome: "correct",
    explanation: "Venodilation reduces venous return.",
    options: [
      {
        id: "a",
        text: "Nitrates",
        in_key: true,
        selected: true,
        classified_correctly: true,
        rationale: "Lowers preload.",
      },
      {
        id: "b",
        text: "Vasopressors",
        in_key: false,
        selected: false,
        classified_correctly: true,
        rationale: "Raises it.",
      },
    ],
  });

  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole("button", { name: /Uncategorized lessons/ }));
  await user.click(await screen.findByRole("button", { name: /Loose lesson/ }));
  await user.click(await screen.findByRole("radio", { name: "Nitrates" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));

  expect(await screen.findByText(/correct — 4\/4 points/)).toBeInTheDocument();
  expect(screen.getByText("Lowers preload.")).toBeInTheDocument();
  expect(answerBankQuestion).toHaveBeenCalledWith("q1", ["a"]);
  // Repeatable: the bank is study, not assessment.
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

test("marks questions already answered, and leaves untouched ones unmarked", async () => {
  getQuestionBankTree.mockResolvedValue({
    ...emptyTree,
    uncategorized_lessons: [
      { id: "l1", title: "Loose lesson", question_count: 3, answered_count: 2 },
    ],
  });
  listQuestionBank.mockResolvedValue([
    {
      ...question,
      id: "q1",
      prompt: "Got it right",
      progress: {
        outcome: "correct",
        points_awarded: 4,
        points_possible: 4,
        attempt_count: 1,
        last_answered_at: "2026-09-30T10:00:00Z",
      },
    },
    {
      ...question,
      id: "q2",
      prompt: "Got it wrong twice",
      progress: {
        outcome: "incorrect",
        points_awarded: 0,
        points_possible: 4,
        attempt_count: 2,
        last_answered_at: "2026-09-30T11:00:00Z",
      },
    },
    { ...question, id: "q3", prompt: "Never tried", progress: null },
  ]);
  getQuizAvailableCount.mockResolvedValue({ available: 3 });

  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole("button", { name: /Uncategorized lessons/ }));
  await user.click(await screen.findByRole("button", { name: /Loose lesson/ }));

  expect(await screen.findByLabelText("Answered correctly, 4 of 4 points")).toBeInTheDocument();
  // A wrong past answer still gets a mark — "seen and failed" is the signal
  // that matters when choosing what to revise.
  expect(
    screen.getByLabelText("Answered incorrectly, 0 of 4 points, 2 attempts"),
  ).toBeInTheDocument();
  // Only the twice-attempted one shows a try count.
  expect(screen.getAllByText(/tries/)).toHaveLength(1);
  // Exactly two marks for three questions: the never-attempted one carries
  // none, so "not tried" stays visually distinct from "tried and scored 0".
  expect(screen.getAllByLabelText(/^Answered /)).toHaveLength(2);
  expect(screen.getByText("Never tried")).toBeInTheDocument();
});

test("marks a question as soon as it is answered, before any refetch", async () => {
  getQuestionBankTree.mockResolvedValue({
    ...emptyTree,
    uncategorized_lessons: [
      { id: "l1", title: "Loose lesson", question_count: 1, answered_count: 0 },
    ],
  });
  listQuestionBank.mockResolvedValue([question]);
  getQuizAvailableCount.mockResolvedValue({ available: 1 });
  answerBankQuestion.mockResolvedValue({
    prompt: question.prompt,
    kind: "single",
    points_awarded: 2,
    points_possible: 4,
    outcome: "partial",
    explanation: null,
    options: [
      { id: "a", text: "Nitrates", in_key: true, selected: true, classified_correctly: true },
      { id: "b", text: "Vasopressors", in_key: false, selected: false, classified_correctly: true },
    ],
  });

  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole("button", { name: /Uncategorized lessons/ }));
  await user.click(await screen.findByRole("button", { name: /Loose lesson/ }));
  await user.click(await screen.findByRole("radio", { name: "Nitrates" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));

  // The list mock still returns progress: null, so this can only come from the
  // fresh reveal — the mark must not wait on a refetch to appear.
  expect(
    await screen.findByLabelText("Answered partially correctly, 2 of 4 points"),
  ).toBeInTheDocument();
});

test("shows success/failing/pending/average-score stats per node and overall", async () => {
  getQuestionBankTree.mockResolvedValue({
    ...emptyTree,
    books: [
      {
        id: "b1",
        title: "Cardiology",
        question_count: 4,
        answered_count: 2,
        correct_count: 1,
        partial_count: 0,
        incorrect_count: 1,
        points_awarded: 4,
        points_possible: 8,
        chapters: [
          {
            id: "c1",
            title: "Heart failure",
            question_count: 4,
            answered_count: 2,
            correct_count: 1,
            partial_count: 0,
            incorrect_count: 1,
            points_awarded: 4,
            points_possible: 8,
            sub_chapters: [],
          },
        ],
      },
    ],
  });

  renderPage();

  // Overall card: sums the one book (nothing uncategorized or unassigned).
  expect(await screen.findByText("Overall")).toBeInTheDocument();
  expect(screen.getByText("2/4 answered")).toBeInTheDocument();

  // Per-book line, inside the collapsed-by-default row. With only one book
  // and nothing uncategorized or unassigned, its stats equal the overall
  // ones, so the same line appears twice: the Overall card and the book row.
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Cardiology/ }));
  expect(
    await screen.findAllByText("50% success · 50% failing · 2 pending · avg score 50%"),
  ).toHaveLength(2);
});

test("hides the admin import link from students", async () => {
  renderPage();

  expect(await screen.findByText("The question bank is empty.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Import questions/ })).not.toBeInTheDocument();
});
