import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";

import QuestionBankScreen from "../question-bank";

const mockGetQuestionBankTree = jest.fn();
const mockListQuestionBank = jest.fn();
const mockGetQuizAvailableCount = jest.fn();
const mockAnswerBankQuestion = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getQuestionBankTree: mockGetQuestionBankTree,
    listQuestionBank: mockListQuestionBank,
    getQuizAvailableCount: mockGetQuizAvailableCount,
    answerBankQuestion: mockAnswerBankQuestion,
  }),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <QuestionBankScreen />
    </QueryClientProvider>,
  );
}

// points_possible/points_awarded cover only the answered subset (1 of the 2
// questions), so both are 4 — the single answered question's point value.
const COUNTS = {
  correct_count: 1,
  partial_count: 0,
  incorrect_count: 0,
  points_awarded: 4,
  points_possible: 4,
};

const TREE = {
  books: [
    {
      id: "b1",
      title: "Book A",
      question_count: 2,
      answered_count: 1,
      ...COUNTS,
      chapters: [
        {
          id: "c1",
          title: "Chapter 1",
          question_count: 2,
          answered_count: 1,
          ...COUNTS,
          sub_chapters: [
            {
              id: "sc1",
              title: "Sub 1.1",
              question_count: 2,
              answered_count: 1,
              ...COUNTS,
              lessons: [
                {
                  id: "d1",
                  title: "Lesson A",
                  question_count: 2,
                  answered_count: 1,
                  ...COUNTS,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  uncategorized_lessons: [],
  unassigned_question_count: 0,
  unassigned_answered_count: 0,
  unassigned_correct_count: 0,
  unassigned_partial_count: 0,
  unassigned_incorrect_count: 0,
  unassigned_points_awarded: 0,
  unassigned_points_possible: 0,
};

const QUESTION = {
  id: "q1",
  prompt: "What is 2 + 2?",
  kind: "single" as const,
  difficulty: "easy" as const,
  points_possible: 1,
  document_id: "d1",
  options: [
    { id: "o1", text: "3" },
    { id: "o2", text: "4" },
  ],
  tags: [],
  progress: null,
};

beforeEach(() => {
  mockGetQuestionBankTree.mockReset();
  mockListQuestionBank.mockReset();
  mockGetQuizAvailableCount.mockReset();
  mockAnswerBankQuestion.mockReset();
});

test("shows an error message when the tree fails to load", async () => {
  mockGetQuestionBankTree.mockRejectedValue(new Error("boom"));

  renderScreen();

  expect(await screen.findByText("Failed to load the question bank.")).toBeTruthy();
});

test("shows an empty state when the bank has nothing in it", async () => {
  mockGetQuestionBankTree.mockResolvedValue({
    books: [],
    uncategorized_lessons: [],
    unassigned_question_count: 0,
    unassigned_answered_count: 0,
  });

  renderScreen();

  expect(await screen.findByText("The question bank is empty.")).toBeTruthy();
});

test("renders the tree collapsed, and expanding down to a lesson shows its questions", async () => {
  mockGetQuestionBankTree.mockResolvedValue(TREE);
  mockListQuestionBank.mockResolvedValue([QUESTION]);
  mockGetQuizAvailableCount.mockResolvedValue({ available: 1 });

  renderScreen();

  expect(await screen.findByText("Book A")).toBeTruthy();
  expect(screen.queryByText("Chapter 1")).toBeNull();

  fireEvent.press(screen.getByText("Book A"));
  fireEvent.press(await screen.findByText("Chapter 1"));
  fireEvent.press(await screen.findByText("Sub 1.1"));
  fireEvent.press(await screen.findByText("Lesson A"));

  expect(await screen.findByText("What is 2 + 2?")).toBeTruthy();
  expect(mockListQuestionBank).toHaveBeenCalledWith({ documentIds: ["d1"], unassigned: undefined });
});

test("shows the Overall card and per-node success/failing/pending/average-score stats", async () => {
  mockGetQuestionBankTree.mockResolvedValue(TREE);
  mockListQuestionBank.mockResolvedValue([QUESTION]);
  mockGetQuizAvailableCount.mockResolvedValue({ available: 1 });

  renderScreen();

  // Overall sums the one book (nothing uncategorized or unassigned here), so
  // "1 correct out of 1 answered, 1 pending" reads as 100% success.
  expect(await screen.findByText("Overall")).toBeTruthy();
  expect(screen.getByText("1/2 answered")).toBeTruthy();
  expect(screen.getByText("100% success · 0% failing · 1 pending · avg score 100%")).toBeTruthy();

  // Expanding the book reveals the same line again — its own stats line,
  // which equals Overall's here since it's the only book.
  fireEvent.press(screen.getByText("Book A"));
  expect(
    await screen.findAllByText("100% success · 0% failing · 1 pending · avg score 100%"),
  ).toHaveLength(2);
});

test("answering a question reveals the outcome", async () => {
  mockGetQuestionBankTree.mockResolvedValue(TREE);
  mockListQuestionBank.mockResolvedValue([QUESTION]);
  mockGetQuizAvailableCount.mockResolvedValue({ available: 1 });
  mockAnswerBankQuestion.mockResolvedValue({
    prompt: QUESTION.prompt,
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

  fireEvent.press(await screen.findByText("Book A"));
  fireEvent.press(await screen.findByText("Chapter 1"));
  fireEvent.press(await screen.findByText("Sub 1.1"));
  fireEvent.press(await screen.findByText("Lesson A"));
  await screen.findByText("What is 2 + 2?");

  fireEvent.press(screen.getByText("4"));
  fireEvent.press(screen.getByText("Check answer"));

  expect(await screen.findByText("correct — 1/1 points")).toBeTruthy();
  expect(mockAnswerBankQuestion).toHaveBeenCalledWith("q1", ["o2"]);
});
