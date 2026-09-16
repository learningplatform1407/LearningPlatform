import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import LecturePage from "./page";

const getDocument = vi.fn();
const createSignedUrl = vi.fn();
const listAnnotations = vi.fn();
const createAnnotation = vi.fn();
const deleteAnnotation = vi.fn();
const listQuizzes = vi.fn();
const listFlashcards = vi.fn();
const getNote = vi.fn();
const upsertNote = vi.fn();
const listDocuments = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getDocument,
    listAnnotations,
    createAnnotation,
    deleteAnnotation,
    listQuizzes,
    listFlashcards,
    getNote,
    upsertNote,
    listDocuments,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "d1" }),
}));

function readyDocumentWithParagraph(text: string) {
  return {
    id: "d1",
    title: "Intro to Systems",
    current_version: {
      id: "v1",
      status: "ready",
      error_message: null,
      extracted_content: { blocks: [{ type: "paragraph", text, page: 1 }] },
      created_at: "2026-01-01",
    },
  };
}

// Walks the paragraph's text nodes (same technique as text-offset.ts's forward
// conversion) so selection still works once existing highlights fragment the
// paragraph into multiple <mark>/<span> children, not just a single text node.
function positionAt(container: Node, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  throw new Error(`offset ${offset} is beyond the container's text content`);
}

function selectTextInParagraph(paragraph: HTMLElement, start: number, end: number) {
  const range = document.createRange();
  const startPos = positionAt(paragraph, start);
  const endPos = positionAt(paragraph, end);
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(paragraph);
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LecturePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getDocument.mockReset();
  createSignedUrl.mockReset();
  listAnnotations.mockReset().mockResolvedValue([]);
  createAnnotation.mockReset().mockResolvedValue({});
  deleteAnnotation.mockReset().mockResolvedValue(undefined);
  listQuizzes.mockReset().mockResolvedValue([]);
  listFlashcards.mockReset().mockResolvedValue([]);
  getNote.mockReset().mockResolvedValue(null);
  upsertNote.mockReset().mockResolvedValue({ document_id: "d1", content: "", updated_at: "2026-01-01" });
  listDocuments.mockReset().mockResolvedValue([]);
});

describe("LecturePage", () => {
  test("renders extracted headings and paragraphs when ready", async () => {
    getDocument.mockResolvedValue({
      id: "d1",
      title: "Intro to Systems",
      current_version: {
        id: "v1",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [
            { type: "heading", text: "Introduction", page: 1 },
            { type: "paragraph", text: "This is the body text.", page: 1 },
          ],
        },
        created_at: "2026-01-01",
      },
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Intro to Systems" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Introduction" })).toBeInTheDocument();
    expect(screen.getByText("This is the body text.")).toBeInTheDocument();
  });

  test("shows a processing message while still processing", async () => {
    getDocument.mockResolvedValue({
      id: "d1",
      title: "Intro to Systems",
      current_version: {
        id: "v1",
        status: "processing",
        error_message: null,
        extracted_content: null,
        created_at: "2026-01-01",
      },
    });

    renderPage();

    expect(await screen.findByText("Processing...")).toBeInTheDocument();
  });

  test("shows the error message when processing failed", async () => {
    getDocument.mockResolvedValue({
      id: "d1",
      title: "Intro to Systems",
      current_version: {
        id: "v1",
        status: "failed",
        error_message: "No extractable text found",
        extracted_content: null,
        created_at: "2026-01-01",
      },
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("No extractable text found");
  });

  test("shows a fetch error", async () => {
    getDocument.mockRejectedValue(new Error("Not found"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Not found");
  });

  test("renders an image block using a signed URL", async () => {
    getDocument.mockResolvedValue({
      id: "d1",
      title: "Intro to Systems",
      current_version: {
        id: "v1",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [
            { type: "heading", text: "Introduction", page: 1 },
            { type: "image", page: 1, image_path: "v1/images/1.png" },
          ],
        },
        created_at: "2026-01-01",
      },
    });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example.com/v1/images/1.png" },
      error: null,
    });

    renderPage();

    // The image is intentionally decorative (alt=""), which correctly excludes
    // it from the accessibility tree's "img" role — query by alt text instead.
    const image = await screen.findByAltText("");
    expect(image).toHaveAttribute("src", "https://signed.example.com/v1/images/1.png");
    expect(createSignedUrl).toHaveBeenCalledWith("v1/images/1.png", 3600);
  });

  test("shows an error if the signed URL request fails", async () => {
    getDocument.mockResolvedValue({
      id: "d1",
      title: "Intro to Systems",
      current_version: {
        id: "v1",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [{ type: "image", page: 1, image_path: "v1/images/1.png" }],
        },
        created_at: "2026-01-01",
      },
    });
    createSignedUrl.mockResolvedValue({ data: null, error: new Error("expired") });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load image.");
  });

  test("renders an existing highlight as a highlighted span", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 6,
        end_offset: 11,
        note_text: null,
        color: "yellow",
        created_at: "2026-01-01",
      },
    ]);

    renderPage();

    const mark = await screen.findByText("world", { selector: "mark" });
    expect(mark).toBeInTheDocument();
    // The rest of the paragraph still renders as plain text around the highlight.
    expect(screen.getByText("Hello", { exact: false })).toBeInTheDocument();
  });

  test("renders an existing margin note and reveals its text on click", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "margin_note",
        block_index: 0,
        start_offset: null,
        end_offset: null,
        note_text: "Remember this",
        color: null,
        created_at: "2026-01-01",
      },
    ]);

    renderPage();

    const noteButton = await screen.findByRole("button", { name: "note" });
    expect(screen.queryByText("Remember this")).not.toBeInTheDocument();

    await userEvent.setup().click(noteButton);

    expect(screen.getByText("Remember this")).toBeInTheDocument();
  });

  test("renders a range-anchored margin note as plain text with a note badge, not a highlight", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "margin_note",
        block_index: 0,
        start_offset: 6,
        end_offset: 11,
        note_text: "Check this later",
        color: null,
        created_at: "2026-01-01",
      },
    ]);

    renderPage();

    await screen.findByRole("button", { name: "note" });
    expect(screen.queryByText("world", { selector: "mark" })).not.toBeInTheDocument();
  });

  test("activating the yellow highlight tool and selecting text creates a highlight immediately, with no floating toolbar", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    const paragraph = await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Highlight — yellow" }));
    selectTextInParagraph(paragraph, 0, 5);

    await waitFor(() =>
      expect(createAnnotation).toHaveBeenCalledWith("d1", {
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 5,
        color: "yellow",
      }),
    );
    expect(screen.queryByRole("toolbar", { name: "Annotation actions" })).not.toBeInTheDocument();
  });

  test("a different color can be chosen and is sent with the highlight", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    const paragraph = await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Highlight — green" }));
    selectTextInParagraph(paragraph, 0, 5);

    await waitFor(() =>
      expect(createAnnotation).toHaveBeenCalledWith("d1", {
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 5,
        color: "green",
      }),
    );
  });

  test("clicking an active color again deactivates the highlight tool", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    const paragraph = await screen.findByText("Hello world");
    const user = userEvent.setup();

    const yellowButton = screen.getByRole("button", { name: "Highlight — yellow" });
    await user.click(yellowButton);
    expect(yellowButton).toHaveAttribute("aria-pressed", "true");

    await user.click(yellowButton);
    expect(yellowButton).toHaveAttribute("aria-pressed", "false");

    selectTextInParagraph(paragraph, 0, 5);

    expect(createAnnotation).not.toHaveBeenCalled();
    // With no tool active, selecting text falls back to the old floating "Add note" toolbar.
    expect(await screen.findByRole("button", { name: "Add note" })).toBeInTheDocument();
  });

  test("choosing a different color switches the active tool instead of stacking", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText("Hello world");
    const user = userEvent.setup();

    const yellowButton = screen.getByRole("button", { name: "Highlight — yellow" });
    const blueButton = screen.getByRole("button", { name: "Highlight — blue" });
    await user.click(yellowButton);
    await user.click(blueButton);

    expect(yellowButton).toHaveAttribute("aria-pressed", "false");
    expect(blueButton).toHaveAttribute("aria-pressed", "true");
  });

  test("the eraser tool deletes highlights overlapping the selection, not unrelated ones", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "overlapping",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 5,
        note_text: null,
        color: "yellow",
        created_at: "2026-01-01",
      },
      {
        id: "far-away",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 6,
        end_offset: 11,
        note_text: null,
        color: "yellow",
        created_at: "2026-01-01",
      },
    ]);

    renderPage();
    const mark = await screen.findByText("Hello", { selector: "mark" });
    const paragraph = mark.closest("p")!;

    await userEvent.setup().click(screen.getByRole("button", { name: "Eraser" }));
    selectTextInParagraph(paragraph, 2, 4);

    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledWith("d1", "overlapping"));
    expect(deleteAnnotation).not.toHaveBeenCalledWith("d1", "far-away");
    // Erasing [2,4) out of the middle of "overlapping" [0,5) leaves two remainders,
    // not a full delete — the highlight isn't an atomic cell, only the erased
    // portion goes away.
    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "highlight",
      block_index: 0,
      start_offset: 0,
      end_offset: 2,
      color: "yellow",
    });
    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "highlight",
      block_index: 0,
      start_offset: 4,
      end_offset: 5,
      color: "yellow",
    });
  });

  test("erasing an entire highlight removes it with no remainder", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 5,
        note_text: null,
        color: "yellow",
        created_at: "2026-01-01",
      },
    ]);

    renderPage();
    const mark = await screen.findByText("Hello", { selector: "mark" });
    const paragraph = mark.closest("p")!;

    await userEvent.setup().click(screen.getByRole("button", { name: "Eraser" }));
    selectTextInParagraph(paragraph, 0, 5);

    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledWith("d1", "a1"));
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  test("erasing from one edge of a highlight shrinks it instead of splitting it in two", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 10,
        note_text: null,
        color: "blue",
        created_at: "2026-01-01",
      },
    ]);

    renderPage();
    const mark = await screen.findByText("Hello worl", { selector: "mark" });
    const paragraph = mark.closest("p")!;

    await userEvent.setup().click(screen.getByRole("button", { name: "Eraser" }));
    selectTextInParagraph(paragraph, 0, 4);

    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledWith("d1", "a1"));
    expect(createAnnotation).toHaveBeenCalledTimes(1);
    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "highlight",
      block_index: 0,
      start_offset: 4,
      end_offset: 10,
      color: "blue",
    });
  });

  test("adjacent highlights render with no gap-causing padding between them", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 5,
        note_text: null,
        color: "yellow",
        created_at: "2026-01-01",
      },
      {
        id: "a2",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 5,
        end_offset: 11,
        note_text: null,
        color: "blue",
        created_at: "2026-01-02",
      },
    ]);

    renderPage();
    const marks = await screen.findAllByText(/./, { selector: "mark" });

    for (const mark of marks) {
      expect(mark.className).not.toContain("px-");
    }
  });

  test("a highlight renders with its stored color", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 5,
        note_text: null,
        color: "green",
        created_at: "2026-01-01",
      },
    ]);

    renderPage();

    const mark = await screen.findByText("Hello", { selector: "mark" });
    expect(mark.className).toContain("bg-green-200");
  });

  test("selecting text and adding a note creates a range-anchored margin note", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();

    const paragraph = await screen.findByText("Hello world");
    selectTextInParagraph(paragraph, 6, 11);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add note" }));
    await user.type(screen.getByPlaceholderText("Note..."), "Check this later");
    await user.click(
      within(screen.getByRole("toolbar", { name: "Annotation actions" })).getByRole("button", {
        name: "Save",
      }),
    );

    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "margin_note",
      block_index: 0,
      start_offset: 6,
      end_offset: 11,
      note_text: "Check this later",
    });
  });

  test("clicking a highlight does not delete it — only the eraser tool can", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      {
        id: "a1",
        document_version_id: "v1",
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 5,
        note_text: null,
        color: "yellow",
        created_at: "2026-01-01",
      },
    ]);

    renderPage();

    const mark = await screen.findByText("Hello", { selector: "mark" });
    await userEvent.setup().click(mark);

    expect(deleteAnnotation).not.toHaveBeenCalled();
    expect(mark).toBeInTheDocument();
  });

  test("renders a chapter / sub-chapter breadcrumb when the lesson is organized", async () => {
    getDocument.mockResolvedValue({
      ...readyDocumentWithParagraph("Hello world"),
      sub_chapter: {
        id: "sc1",
        title: "Sub A",
        chapter: { id: "c1", title: "Chapter One" },
      },
    });

    renderPage();

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    expect(screen.getByText(/Sub A/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chapter One" })).toHaveAttribute(
      "href",
      "/learn/lessons/c1",
    );
  });

  test("omits the breadcrumb when the lesson is uncategorized", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();

    await screen.findByText("Hello world");
    expect(screen.queryByRole("link", { name: /Chapter/ })).not.toBeInTheDocument();
  });

  test("switching to the Quizzes tab shows a Coming soon placeholder", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Quizzes" }));

    expect(await screen.findByText("Coming soon.")).toBeInTheDocument();
    expect(listQuizzes).toHaveBeenCalledWith("d1");
  });

  test("switching to the Flashcards tab shows a Coming soon placeholder", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Flashcards" }));

    expect(await screen.findByText("Coming soon.")).toBeInTheDocument();
    expect(listFlashcards).toHaveBeenCalledWith("d1");
  });

  test("switching back to the Lesson tab restores the reader content", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText("Hello world");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Quizzes" }));
    expect(screen.queryByText("Hello world")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lesson" }));
    expect(await screen.findByText("Hello world")).toBeInTheDocument();
  });

  test("the notes panel loads the existing note and saves edits, alongside the lesson text", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    getNote.mockResolvedValue({
      document_id: "d1",
      content: "Existing note",
      updated_at: "2026-01-01",
    });
    upsertNote.mockResolvedValue({
      document_id: "d1",
      content: "Updated note",
      updated_at: "2026-01-02",
    });

    renderPage();
    await screen.findByText("Hello world");
    const user = userEvent.setup();

    const textarea = await screen.findByPlaceholderText("Write your notes for this lesson...");
    expect(textarea).toHaveValue("Existing note");
    // The notes panel is visible in parallel with the lesson text, not behind a tab.
    expect(screen.getByText("Hello world")).toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, "Updated note");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Saved.");
    expect(upsertNote).toHaveBeenCalledWith("d1", "Updated note");
  });

  test("the notes panel starts empty when the lesson has no note yet", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    getNote.mockResolvedValue(null);

    renderPage();

    const textarea = await screen.findByPlaceholderText("Write your notes for this lesson...");
    expect(textarea).toHaveValue("");
  });

  test("the notes panel collapses and expands via its toggle button", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText("Hello world");
    const user = userEvent.setup();

    expect(
      await screen.findByPlaceholderText("Write your notes for this lesson..."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse notes" }));
    expect(screen.queryByPlaceholderText("Write your notes for this lesson...")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand notes" }));
    expect(
      await screen.findByPlaceholderText("Write your notes for this lesson..."),
    ).toBeInTheDocument();
  });

  test("the table of contents lists the current sub-chapter's lessons and highlights the current one", async () => {
    getDocument.mockResolvedValue({
      ...readyDocumentWithParagraph("Hello world"),
      sub_chapter: { id: "sc1", title: "Sub A", chapter: { id: "c1", title: "Chapter One" } },
    });
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Intro to Systems", created_at: "2026-01-01", status: "ready" },
      { id: "d2", title: "Second lesson", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();

    expect(await screen.findByText("Second lesson")).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledWith("sc1");

    const currentLink = screen.getByRole("link", { name: "Intro to Systems" });
    const siblingLink = screen.getByRole("link", { name: "Second lesson" });
    expect(currentLink).toHaveAttribute("href", "/learn/d1");
    expect(siblingLink).toHaveAttribute("href", "/learn/d2");
    expect(currentLink.className).toContain("font-semibold");
    expect(siblingLink.className).not.toContain("font-semibold");
  });

  test("the table of contents falls back to the Uncategorized bucket when the lesson has no sub-chapter", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Intro to Systems", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();

    await screen.findByText("Hello world");
    expect(listDocuments).toHaveBeenCalledWith("none");
  });
});
