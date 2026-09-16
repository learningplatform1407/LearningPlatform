import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import NotebookLessonScreen from "../[documentId]";

const mockGetNote = jest.fn();
const mockUpsertNote = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getNote: mockGetNote,
    upsertNote: mockUpsertNote,
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: jest.fn() }) } },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotebookLessonScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGetNote.mockReset();
  mockUpsertNote.mockReset();
  (router.back as jest.Mock).mockReset();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ documentId: "d1" });
});

test("shows the existing lesson note content and saves edits via the shared NotesTab", async () => {
  mockGetNote.mockResolvedValue({ document_id: "d1", content: "Existing note", updated_at: "x" });
  mockUpsertNote.mockResolvedValue({ document_id: "d1", content: "Edited note", updated_at: "y" });

  renderScreen();

  const input = await screen.findByDisplayValue("Existing note");
  fireEvent.changeText(input, "Edited note");
  fireEvent.press(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(mockUpsertNote).toHaveBeenCalledWith("d1", "Edited note"));
});

test("← Notebook goes back", async () => {
  mockGetNote.mockResolvedValue(null);

  renderScreen();
  await screen.findByText("← Notebook");

  fireEvent.press(screen.getByText("← Notebook"));
  expect(router.back).toHaveBeenCalled();
});
