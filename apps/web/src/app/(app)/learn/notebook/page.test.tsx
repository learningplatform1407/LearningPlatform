import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import NotebookPage from "./page";

const listMyNotes = vi.fn();
const listNotebookEntries = vi.fn();
const createNotebookEntry = vi.fn();
const updateNotebookEntry = vi.fn();
const deleteNotebookEntry = vi.fn();
const getNote = vi.fn();
const upsertNote = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    listMyNotes,
    listNotebookEntries,
    createNotebookEntry,
    updateNotebookEntry,
    deleteNotebookEntry,
    getNote,
    upsertNote,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotebookPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listMyNotes.mockReset().mockResolvedValue([]);
  listNotebookEntries.mockReset().mockResolvedValue([]);
  createNotebookEntry.mockReset();
  updateNotebookEntry.mockReset();
  deleteNotebookEntry.mockReset();
  getNote.mockReset();
  upsertNote.mockReset();
});

describe("NotebookPage", () => {
  test("shows lesson notes and my notes sections once loaded", async () => {
    listMyNotes.mockResolvedValue([
      {
        document_id: "d1",
        document_title: "Intro to Systems",
        content: "Remember the key formula.",
        updated_at: "2026-01-01",
      },
    ]);
    listNotebookEntries.mockResolvedValue([
      { id: "n1", type: "text", content: "Idea for the project", strokes: null },
    ]);

    renderPage();

    expect(await screen.findByText("Intro to Systems")).toBeInTheDocument();
    expect(screen.getByText("Remember the key formula.")).toBeInTheDocument();
    expect(screen.getByText("Idea for the project")).toBeInTheDocument();
  });

  test("shows empty states when there's nothing yet", async () => {
    renderPage();

    expect(await screen.findByText("No lesson notes yet.")).toBeInTheDocument();
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
    expect(screen.getByText("Select a note on the left, or create a new one.")).toBeInTheDocument();
  });

  test("selecting a lesson note shows the shared NotesTab editor", async () => {
    listMyNotes.mockResolvedValue([
      { document_id: "d1", document_title: "Intro to Systems", content: "Draft", updated_at: "x" },
    ]);
    getNote.mockResolvedValue({ document_id: "d1", content: "Draft", updated_at: "x" });

    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByText("Intro to Systems"));

    const textarea = await screen.findByPlaceholderText("Write your notes for this lesson...");
    await waitFor(() => expect(textarea).toHaveValue("Draft"));
  });

  test("creating a new text note calls createNotebookEntry with the typed content", async () => {
    createNotebookEntry.mockResolvedValue({ id: "n2", type: "text", content: "Fresh idea", strokes: null });

    renderPage();
    await screen.findByText("No notes yet.");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ Text" }));
    await user.type(screen.getByPlaceholderText("Write a new note..."), "Fresh idea");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createNotebookEntry).toHaveBeenCalledWith({ type: "text", content: "Fresh idea" }),
    );
  });

  test("editing an existing text entry calls updateNotebookEntry", async () => {
    listNotebookEntries.mockResolvedValue([
      { id: "n1", type: "text", content: "Original", strokes: null },
    ]);
    updateNotebookEntry.mockResolvedValue({ id: "n1", type: "text", content: "Edited", strokes: null });

    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByText("Original"));

    const textarea = await screen.findByDisplayValue("Original");
    await user.clear(textarea);
    await user.type(textarea, "Edited");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateNotebookEntry).toHaveBeenCalledWith("n1", { content: "Edited" }),
    );
  });

  test("deleting an entry calls deleteNotebookEntry and clears the selection", async () => {
    listNotebookEntries.mockResolvedValue([
      { id: "n1", type: "text", content: "Temp note", strokes: null },
    ]);
    deleteNotebookEntry.mockResolvedValue(undefined);

    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByText("Temp note"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteNotebookEntry).toHaveBeenCalledWith("n1"));
    await waitFor(() =>
      expect(
        screen.getByText("Select a note on the left, or create a new one."),
      ).toBeInTheDocument(),
    );
  });

  test("creating a new drawing note calls createNotebookEntry with stroke data", async () => {
    createNotebookEntry.mockResolvedValue({ id: "n3", type: "drawing", content: null, strokes: [] });

    renderPage();
    await screen.findByText("No notes yet.");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ Drawing" }));

    const canvas = await screen.findByRole("img", { name: "Drawing canvas" });
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pressure: 0.4 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 40, pressure: 0.5 });
    fireEvent.pointerUp(canvas, { clientX: 30, clientY: 40 });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createNotebookEntry).toHaveBeenCalledTimes(1));
    const [payload] = createNotebookEntry.mock.calls[0] as [{ type: string; strokes: unknown[] }];
    expect(payload.type).toBe("drawing");
    expect(payload.strokes).toHaveLength(1);
  });
});
