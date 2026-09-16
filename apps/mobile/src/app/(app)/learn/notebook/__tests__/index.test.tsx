import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import NotebookScreen from "../index";

const mockListMyNotes = jest.fn();
const mockListNotebookEntries = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    listMyNotes: mockListMyNotes,
    listNotebookEntries: mockListNotebookEntries,
  }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotebookScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockListMyNotes.mockReset().mockResolvedValue([]);
  mockListNotebookEntries.mockReset().mockResolvedValue([]);
  (router.push as jest.Mock).mockReset();
});

test("shows empty states when there's nothing yet", async () => {
  renderScreen();

  expect(await screen.findByText("No lesson notes yet.")).toBeTruthy();
  expect(screen.getByText("No notes yet.")).toBeTruthy();
});

test("renders lesson notes and navigates to the lesson note screen on press", async () => {
  mockListMyNotes.mockResolvedValue([
    { document_id: "d1", document_title: "Intro to Systems", content: "Draft note", updated_at: "x" },
  ]);

  renderScreen();

  expect(await screen.findByText("Intro to Systems")).toBeTruthy();
  expect(screen.getByText("Draft note")).toBeTruthy();

  fireEvent.press(screen.getByText("Intro to Systems"));
  expect(router.push).toHaveBeenCalledWith("/learn/notebook/lesson/d1");
});

test("renders a text entry preview and navigates to the entry screen on press", async () => {
  mockListNotebookEntries.mockResolvedValue([
    { id: "n1", type: "text", content: "Idea for the project", strokes: null },
  ]);

  renderScreen();

  expect(await screen.findByText("Idea for the project")).toBeTruthy();
  fireEvent.press(screen.getByText("Idea for the project"));
  expect(router.push).toHaveBeenCalledWith("/learn/notebook/entry/n1");
});

test("renders a drawing entry as a Drawing row and navigates to it", async () => {
  mockListNotebookEntries.mockResolvedValue([
    {
      id: "n2",
      type: "drawing",
      content: null,
      strokes: [{ color: "#000", width: 0.01, points: [{ x: 0.1, y: 0.1 }] }],
    },
  ]);

  renderScreen();

  expect(await screen.findByText("Drawing")).toBeTruthy();
  fireEvent.press(screen.getByText("Drawing"));
  expect(router.push).toHaveBeenCalledWith("/learn/notebook/entry/n2");
});

test("+ Text and + Drawing navigate to the sentinel new-note routes", async () => {
  renderScreen();
  await screen.findByText("No notes yet.");

  fireEvent.press(screen.getByText("+ Text"));
  expect(router.push).toHaveBeenCalledWith("/learn/notebook/entry/new-text");

  fireEvent.press(screen.getByText("+ Drawing"));
  expect(router.push).toHaveBeenCalledWith("/learn/notebook/entry/new-drawing");
});

test("← Learn navigates back to the Learn hub", async () => {
  renderScreen();
  await screen.findByText("No notes yet.");

  fireEvent.press(screen.getByText("← Learn"));
  expect(router.push).toHaveBeenCalledWith("/learn");
});
