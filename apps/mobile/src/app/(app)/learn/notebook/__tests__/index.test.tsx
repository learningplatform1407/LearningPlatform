import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import NotebookScreen from "../index";

const mockListNotebookEntries = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
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
  mockListNotebookEntries.mockReset().mockResolvedValue([]);
  (router.push as jest.Mock).mockReset();
});

test("shows empty state when there's nothing yet", async () => {
  renderScreen();

  expect(await screen.findByText("No notes yet.")).toBeTruthy();
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
