import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import NotebookEntryScreen from "../[entryId]";

const mockListNotebookEntries = jest.fn();
const mockCreateNotebookEntry = jest.fn();
const mockUpdateNotebookEntry = jest.fn();
const mockDeleteNotebookEntry = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    listNotebookEntries: mockListNotebookEntries,
    createNotebookEntry: mockCreateNotebookEntry,
    updateNotebookEntry: mockUpdateNotebookEntry,
    deleteNotebookEntry: mockDeleteNotebookEntry,
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotebookEntryScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockListNotebookEntries.mockReset().mockResolvedValue([]);
  mockCreateNotebookEntry.mockReset();
  mockUpdateNotebookEntry.mockReset();
  mockDeleteNotebookEntry.mockReset();
  (router.back as jest.Mock).mockReset();
});

test("new-text sentinel shows an empty text editor with Save disabled until typed", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ entryId: "new-text" });
  mockCreateNotebookEntry.mockResolvedValue({ id: "n1", type: "text", content: "Fresh idea", strokes: null });

  renderScreen();

  expect(await screen.findByText("New note")).toBeTruthy();
  const saveButton = screen.getByRole("button", { name: "Save" });
  expect(saveButton.props.accessibilityState?.disabled).toBe(true);

  fireEvent.changeText(screen.getByPlaceholderText("Write a new note..."), "Fresh idea");
  fireEvent.press(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(mockCreateNotebookEntry).toHaveBeenCalledWith({ type: "text", content: "Fresh idea" }),
  );
  expect(router.back).toHaveBeenCalled();
});

test("editing an existing text entry calls updateNotebookEntry and stays on the screen", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ entryId: "n1" });
  mockListNotebookEntries.mockResolvedValue([
    { id: "n1", type: "text", content: "Original", strokes: null },
  ]);
  mockUpdateNotebookEntry.mockResolvedValue({ id: "n1", type: "text", content: "Edited", strokes: null });

  renderScreen();

  const input = await screen.findByDisplayValue("Original");
  fireEvent.changeText(input, "Edited");
  fireEvent.press(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(mockUpdateNotebookEntry).toHaveBeenCalledWith("n1", { content: "Edited" }),
  );
  expect(screen.getByText("Saved.")).toBeTruthy();
});

test("deleting an existing entry calls deleteNotebookEntry and navigates back", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ entryId: "n1" });
  mockListNotebookEntries.mockResolvedValue([
    { id: "n1", type: "text", content: "Temp note", strokes: null },
  ]);
  mockDeleteNotebookEntry.mockResolvedValue(undefined);

  renderScreen();

  await screen.findByDisplayValue("Temp note");
  fireEvent.press(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(mockDeleteNotebookEntry).toHaveBeenCalledWith("n1"));
  expect(router.back).toHaveBeenCalled();
});

test("shows a not-found message for an unknown entry id", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ entryId: "missing" });
  mockListNotebookEntries.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("Note not found.")).toBeTruthy();
});

test("new-drawing sentinel shows the drawing canvas instead of a text editor", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ entryId: "new-drawing" });

  renderScreen();

  expect(await screen.findByText("New note")).toBeTruthy();
  expect(screen.getByLabelText("Drawing canvas")).toBeTruthy();
  expect(screen.queryByPlaceholderText("Write a new note...")).toBeNull();
});
