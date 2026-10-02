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

const TREE = {
  books: [
    {
      id: "b1",
      title: "Book A",
      question_count: 2,
      answered_count: 1,
      chapters: [
        {
          id: "c1",
          title: "Chapter 1",
          question_count: 2,
          answered_count: 1,
          sub_chapters: [
            {
              id: "sc1",
              title: "Sub 1.1",
              question_count: 2,
              answered_count: 1,
              lessons: [{ id: "d1", title: "Lesson A", question_count: 2, answered_count: 1 }],
            },
          ],
        },
      ],
    },
  ],
  uncategorized_lessons: [],
  unassigned_question_count: 0,
  unassigned_answered_count: 0,
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
