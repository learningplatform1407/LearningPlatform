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
const listQuestionBank = vi.fn();
const getQuizAvailableCount = vi.fn();
const listFlashcards = vi.fn();
const listDueFlashcards = vi.fn();
const createFlashcard = vi.fn();
const updateFlashcard = vi.fn();
const deleteFlashcard = vi.fn();
const submitFlashcardReview = vi.fn();
const setFlashcardSuspension = vi.fn();
const listDueClozeCards = vi.fn();
const submitClozeReview = vi.fn();
const listNotebookEntries = vi.fn();
const createNotebookEntry = vi.fn();
const updateNotebookEntry = vi.fn();
const deleteNotebookEntry = vi.fn();
const listDocuments = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getDocument,
    listAnnotations,
    createAnnotation,
    deleteAnnotation,
    listQuestionBank,
    getQuizAvailableCount,
    listFlashcards,
    listDueFlashcards,
    createFlashcard,
    updateFlashcard,
    deleteFlashcard,
    submitFlashcardReview,
    setFlashcardSuspension,
    listDueClozeCards,
    submitClozeReview,
    listNotebookEntries,
    createNotebookEntry,
    updateNotebookEntry,
    deleteNotebookEntry,
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
  useSearchParams: () => new URLSearchParams(),
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
  listDueFlashcards.mockReset().mockResolvedValue([]);
  createFlashcard.mockReset();
  updateFlashcard.mockReset();
  deleteFlashcard.mockReset().mockResolvedValue(undefined);
  submitFlashcardReview.mockReset();
  setFlashcardSuspension.mockReset().mockResolvedValue({
    id: "s1",
    flashcard_id: "f1",
    suspended: true,
    ease_factor: 2.5,
    interval_days: 1,
    repetitions: 1,
    due_at: "2026-10-07T00:00:00Z",
    last_reviewed_at: null,
  });
  listQuestionBank.mockReset().mockResolvedValue([]);
  getQuizAvailableCount.mockReset().mockResolvedValue({ available: 0 });
  listFlashcards.mockReset().mockResolvedValue([]);
  listDueClozeCards.mockReset().mockResolvedValue([]);
  submitClozeReview.mockReset();
  listNotebookEntries.mockReset().mockResolvedValue([]);
  createNotebookEntry.mockReset();
  updateNotebookEntry.mockReset();
  deleteNotebookEntry.mockReset();
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
    // With no tool active, selecting text falls back to the floating Notes/Explain toolbar.
    expect(await screen.findByRole("button", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explain" })).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Notes" }));
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

  test("selecting text and clicking Explain shows a coming-soon message instead of a form", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();

    const paragraph = await screen.findByText("Hello world");
    selectTextInParagraph(paragraph, 6, 11);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Explain" }));

    expect(screen.getByText("AI explanations are coming soon.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
    expect(createAnnotation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByText("AI explanations are coming soon.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
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
        chapter: { id: "c1", book_id: "b1", title: "Chapter One" },
      },
    });

    renderPage();

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    expect(screen.getByText(/Sub A/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chapter One" })).toHaveAttribute(
      "href",
      "/learn/library/b1/c1",
    );
  });

  test("omits the breadcrumb when the lesson is uncategorized", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();

    await screen.findByText("Hello world");
    expect(screen.queryByRole("link", { name: /Chapter/ })).not.toBeInTheDocument();
  });

  test("the Quizzes tab lists this lesson's questions without the answer key", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listQuestionBank.mockResolvedValue([
      {
        id: "q1",
        prompt: "Which drug lowers preload?",
        kind: "single",
        difficulty: "medium",
        points_possible: 4,
        document_id: "d1",
        options: [
          { id: "a", text: "Nitrates" },
          { id: "b", text: "Vasopressors" },
        ],
        tags: [{ id: "t1", slug: "cardiology", label: "Cardiology" }],
      },
    ]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Quizzes" }));

    expect(await screen.findByText("Which drug lowers preload?")).toBeInTheDocument();
    expect(screen.getByText("Nitrates")).toBeInTheDocument();
    // Scoped to this lesson by document_id — a question's provenance.
    expect(listQuestionBank).toHaveBeenCalledWith({ documentIds: ["d1"] });
  });

  test("the Quizzes tab marks a question answered on a previous visit", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listQuestionBank.mockResolvedValue([
      {
        id: "q1",
        prompt: "Which drug lowers preload?",
        kind: "single",
        difficulty: "medium",
        points_possible: 4,
        document_id: "d1",
        options: [{ id: "a", text: "Nitrates" }],
        tags: [],
        progress: {
          outcome: "correct",
          points_awarded: 4,
          points_possible: 4,
          attempt_count: 1,
          last_answered_at: "2026-09-30T10:00:00Z",
        },
      },
    ]);

    renderPage();
    await screen.findByText("Hello world");
    await userEvent.setup().click(screen.getByRole("button", { name: "Quizzes" }));

    expect(await screen.findByLabelText("Answered correctly, 4 of 4 points")).toBeInTheDocument();
  });

  test("the Quizzes tab says so when the lesson has no questions", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listQuestionBank.mockResolvedValue([]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Quizzes" }));

    expect(await screen.findByText("No questions for this lesson yet.")).toBeInTheDocument();
  });

  function officialCard(overrides: Record<string, unknown> = {}) {
    return {
      id: "f1",
      document_id: "d1",
      front_text: "What is a CDN?",
      back_text: "A content delivery network.",
      scope: "official",
      is_mine: false,
      due_at: null,
      is_new: true,
      ...overrides,
    };
  }

  function lessonCard(overrides: Record<string, unknown> = {}) {
    return {
      id: "f1",
      document_id: "d1",
      front_text: "What is a CDN?",
      back_text: "A content delivery network.",
      scope: "official",
      status: "published",
      order_index: 0,
      is_mine: false,
      suspended: false,
      can_edit: false,
      can_delete: false,
      ...overrides,
    };
  }

  test("a card can be excluded from reviews straight from the runner", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByText("What is a CDN?"));
    await user.click(screen.getByRole("button", { name: "Exclude this card from reviews" }));

    expect(setFlashcardSuspension).toHaveBeenCalledWith("f1", true);
    expect(
      await screen.findByText("Excluded from reviews. You can include it again below."),
    ).toBeInTheDocument();
  });

  test("an excluded card is still listed, and can be included again", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    // Excluded cards are absent from the deck — the server drops them — so
    // the list is the only route back into the rotation.
    listDueFlashcards.mockResolvedValue([]);
    listFlashcards.mockResolvedValue([lessonCard({ suspended: true })]);
    setFlashcardSuspension.mockResolvedValue({
      id: "s1",
      flashcard_id: "f1",
      suspended: false,
      ease_factor: 2.5,
      interval_days: 6,
      repetitions: 2,
      due_at: "2026-10-12T00:00:00Z",
      last_reviewed_at: "2026-10-06T00:00:00Z",
    });

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));

    expect(await screen.findByText("Not in rotation")).toBeInTheDocument();
    expect(screen.getByText(/1 excluded/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Include in reviews" }));

    expect(setFlashcardSuspension).toHaveBeenCalledWith("f1", false);
  });

  test("cancelling an edit discards the draft instead of committing it later", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([]);
    listFlashcards.mockResolvedValue([
      lessonCard({ can_edit: true, can_delete: true, front_text: "Mitral valve" }),
    ]);

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    const front = screen.getByLabelText("Front");
    await user.clear(front);
    await user.type(front, "xxx");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Reopening must show the stored text, not the abandoned draft —
    // otherwise Save would commit an edit the learner cancelled.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Front")).toHaveValue("Mitral valve");
  });

  test("Save is blocked while a field is empty", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([]);
    listFlashcards.mockResolvedValue([lessonCard({ can_edit: true, can_delete: true })]);

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Front"));

    // The server rejects an empty field with a 422; stopping here avoids a
    // round-trip that would surface as an unexplained non-response.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(updateFlashcard).not.toHaveBeenCalled();
  });

  test("a failed include/exclude toggle is reported, not swallowed", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([]);
    listFlashcards.mockResolvedValue([lessonCard({ suspended: true })]);
    setFlashcardSuspension.mockRejectedValue(new Error("offline"));

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByRole("button", { name: "Include in reviews" }));

    // This toggle is the only route back into the rotation, so silence would
    // leave the learner unable to tell the card is still excluded.
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not include that card.");
  });

  test("a lesson whose every card is excluded does not claim to have none", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    // The server filters suspended cards out of the deck, so an all-excluded
    // lesson has an empty deck but is not an empty lesson.
    listDueFlashcards.mockResolvedValue([]);
    listFlashcards.mockResolvedValue([lessonCard({ suspended: true })]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Flashcards" }));

    await screen.findByText("Not in rotation");
    expect(screen.queryByText(/No flashcards for this lesson yet/)).not.toBeInTheDocument();
    expect(
      screen.getByText("You're all caught up — nothing to review right now."),
    ).toBeInTheDocument();
  });

  test("switching scope resets the session counter", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);
    submitFlashcardReview.mockResolvedValue({
      id: "s1",
      flashcard_id: "f1",
      suspended: false,
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 1,
      due_at: "2026-10-07T00:00:00Z",
      last_reviewed_at: "2026-10-06T00:00:00Z",
    });

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByText("What is a CDN?"));
    await user.click(screen.getByRole("button", { name: "Good" }));
    await screen.findByText("Next review in 1 day.");

    await user.click(screen.getByRole("button", { name: "Official" }));

    // The deck is re-keyed by scope, so a counter carried over from the
    // previous scope would report a position the new deck doesn't have.
    expect(await screen.findByText("Card 1 of 1")).toBeInTheDocument();
    expect(screen.queryByText("Next review in 1 day.")).not.toBeInTheDocument();
  });

  test("the lesson list offers exclusion on official cards the learner cannot edit", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([]);
    listFlashcards.mockResolvedValue([lessonCard({ is_mine: false })]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Flashcards" }));

    // Suspension writes the caller's own review state, so it applies to
    // shared content; editing and deleting do not.
    expect(await screen.findByRole("button", { name: "Exclude from reviews" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("the Flashcards tab shows the front only until the card is tapped", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));

    expect(await screen.findByText("What is a CDN?")).toBeInTheDocument();
    // The back ships with the deck but must not be rendered before the tap —
    // that reveal-on-demand is the whole interaction.
    expect(screen.queryByText("A content delivery network.")).not.toBeInTheDocument();
    expect(screen.getByText("Tap to reveal")).toBeInTheDocument();

    await user.click(screen.getByText("What is a CDN?"));

    expect(await screen.findByText("A content delivery network.")).toBeInTheDocument();
    for (const label of ["Again", "Hard", "Good", "Easy"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  test("grading a flashcard submits the rating and reports the next interval", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);
    submitFlashcardReview.mockResolvedValue({
      id: "s1",
      flashcard_id: "f1",
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 1,
      due_at: "2026-10-07T00:00:00Z",
      last_reviewed_at: "2026-10-06T00:00:00Z",
    });

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByText("What is a CDN?"));
    await user.click(screen.getByRole("button", { name: "Good" }));

    expect(submitFlashcardReview).toHaveBeenCalledWith("f1", "good");
    expect(await screen.findByText("Next review in 1 day.")).toBeInTheDocument();
    expect(
      await screen.findByText("You're all caught up — nothing to review right now."),
    ).toBeInTheDocument();
  });

  test("Again brings the card back later in the same session", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([
      officialCard(),
      officialCard({ id: "f2", front_text: "What is TTL?" }),
    ]);
    submitFlashcardReview.mockResolvedValue({
      id: "s1",
      flashcard_id: "f1",
      suspended: false,
      ease_factor: 2.3,
      interval_days: 1,
      repetitions: 0,
      due_at: "2026-10-08T00:00:00Z",
      last_reviewed_at: "2026-10-07T00:00:00Z",
    });

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByText("What is a CDN?"));
    await user.click(screen.getByRole("button", { name: "Again" }));

    // The server scheduled it for tomorrow — its floor is a whole day — so
    // holding it client-side is what makes "Again" mean "again now".
    expect(
      await screen.findByText("You'll see this one again before you finish."),
    ).toBeInTheDocument();
    // Appended, not re-shown immediately: the next card is the other one.
    expect(await screen.findByText("What is TTL?")).toBeInTheDocument();
    // Two cards still to do, and nothing counted as finished.
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument();
  });

  test("a card rated Again and then Good is finished and does not return", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);
    submitFlashcardReview.mockResolvedValue({
      id: "s1",
      flashcard_id: "f1",
      suspended: false,
      ease_factor: 2.3,
      interval_days: 1,
      repetitions: 0,
      due_at: "2026-10-08T00:00:00Z",
      last_reviewed_at: "2026-10-07T00:00:00Z",
    });

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByText("What is a CDN?"));
    await user.click(screen.getByRole("button", { name: "Again" }));

    // It came back as the only card left.
    await user.click(await screen.findByText("What is a CDN?"));
    await user.click(screen.getByRole("button", { name: "Good" }));

    expect(
      await screen.findByText("You're all caught up — nothing to review right now."),
    ).toBeInTheDocument();
  });

  test("an official card offers Retire to an admin, never Edit", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([]);
    // What the importing admin actually gets back: they created it, so
    // is_mine is true, but an official card is not editable.
    listFlashcards.mockResolvedValue([
      lessonCard({ is_mine: true, can_edit: false, can_delete: true, scope: "official" }),
    ]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Flashcards" }));

    expect(await screen.findByRole("button", { name: "Retire" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  test("a failed grade is reported rather than silently doing nothing", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);
    submitFlashcardReview.mockRejectedValue(new Error("offline"));

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByText("What is a CDN?"));
    await user.click(screen.getByRole("button", { name: "Good" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save that rating.");
    // The card must stay in the queue — it was never actually graded.
    expect(screen.getByText("What is a CDN?")).toBeInTheDocument();
  });

  test("the Flashcards tab says so when the lesson has no cards at all", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Flashcards" }));

    expect(
      await screen.findByText(
        "No flashcards for this lesson yet. Add your own, or check back for official ones.",
      ),
    ).toBeInTheDocument();
  });

  test("the scope toggle narrows the deck to the learner's own cards", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await screen.findByText("What is a CDN?");

    await user.click(screen.getByRole("button", { name: "Mine" }));

    expect(listDueFlashcards).toHaveBeenCalledWith("d1", { scope: "personal" });
  });

  test("a learner can add their own card to the lesson", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([]);
    createFlashcard.mockResolvedValue({
      id: "f2",
      document_id: "d1",
      front_text: "Mnemonic?",
      back_text: "Remember it like this.",
      scope: "personal",
      status: "published",
      order_index: 0,
      is_mine: true,
    });

    renderPage();
    await screen.findByText("Hello world");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByRole("button", { name: "Add a card" }));

    await user.type(screen.getByLabelText("Front"), "Mnemonic?");
    await user.type(screen.getByLabelText("Back"), "Remember it like this.");
    await user.click(screen.getByRole("button", { name: "Save card" }));

    expect(createFlashcard).toHaveBeenCalledWith("d1", {
      front_text: "Mnemonic?",
      back_text: "Remember it like this.",
    });
  });

  test("a card carries its provenance as a word, not just a colour", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard({ scope: "personal", is_mine: true })]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Flashcards" }));

    // Queried through the card rather than by bare text: the scope filter
    // offers a button labelled "Mine" too, so a global text match is
    // ambiguous. Provenance is always a word, never colour alone (WCAG 1.4.1).
    const card = await screen.findByRole("button", { name: /What is a CDN\?/ });
    expect(card).toHaveTextContent("Mine");
  });

  test("an official card is badged as official", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);

    renderPage();
    await screen.findByText("Hello world");

    await userEvent.setup().click(screen.getByRole("button", { name: "Flashcards" }));

    const card = await screen.findByRole("button", { name: /What is a CDN\?/ });
    expect(card).toHaveTextContent("Official");
  });

  test("the Review tab shows the whole lesson with the due word blanked, then reveals it on demand", async () => {
    getDocument.mockResolvedValue({
      id: "d1",
      title: "Intro to Systems",
      current_version: {
        id: "v1",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [
            { type: "heading", text: "Cell Biology", page: 1 },
            { type: "paragraph", text: "The mitochondria produces energy.", page: 1 },
          ],
        },
        created_at: "2026-01-01",
      },
    });
    listDueClozeCards.mockResolvedValue([
      { id: "c1", document_id: "d1", block_index: 1, start_offset: 4, end_offset: 16 },
    ]);

    renderPage();
    await screen.findByText(/The mitochondria produces energy\./);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Review" }));

    // The whole lesson (heading included) stays visible during review, not
    // just the paragraph containing the due word.
    expect(await screen.findByText("Cell Biology")).toBeInTheDocument();
    expect(screen.getByText("[...]")).toBeInTheDocument();
    expect(screen.queryByText("mitochondria")).not.toBeInTheDocument();
    expect(screen.getByText("1 word left to review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(screen.getByText("mitochondria")).toBeInTheDocument();
    expect(screen.queryByText("[...]")).not.toBeInTheDocument();
    for (const label of ["Again", "Hard", "Good", "Easy"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  test("two due words in the same paragraph are revealed one at a time, in order", async () => {
    getDocument.mockResolvedValue(
      readyDocumentWithParagraph("The database index accelerates lookups."),
    );
    listDueClozeCards.mockResolvedValue([
      { id: "c1", document_id: "d1", block_index: 0, start_offset: 4, end_offset: 12 }, // "database"
      { id: "c2", document_id: "d1", block_index: 0, start_offset: 13, end_offset: 18 }, // "index"
    ]);

    renderPage();
    await screen.findByText(/The database index accelerates lookups\./);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Review" }));

    // Both due words start hidden, each as its own "[...]" segment.
    expect(await screen.findAllByText("[...]")).toHaveLength(2);
    expect(screen.getByText("2 words left to review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("database")).toBeInTheDocument();
    expect(screen.getAllByText("[...]")).toHaveLength(1); // "index" still queued

    await user.click(screen.getByRole("button", { name: "Good" }));
    await waitFor(() => expect(screen.getByText("1 word left to review")).toBeInTheDocument());
    // "database" is no longer its own cloze span once graded -- it merges
    // back into the surrounding plain-text run, so it's matched by
    // substring here rather than as an isolated node.
    expect(screen.getByText(/database/)).toBeInTheDocument();
    expect(screen.getByText("[...]")).toBeInTheDocument(); // "index" still hidden, Show not pressed yet

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("index")).toBeInTheDocument();
    expect(screen.queryByText("[...]")).not.toBeInTheDocument();
  });

  test("grading a Review word submits the rating and shows the next-interval feedback", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("The mitochondria produces energy."));
    listDueClozeCards.mockResolvedValue([
      { id: "c1", document_id: "d1", block_index: 0, start_offset: 4, end_offset: 16 },
    ]);
    submitClozeReview.mockResolvedValue({
      id: "s1",
      cloze_card_id: "c1",
      ease_factor: 2.5,
      interval_days: 6,
      repetitions: 2,
      due_at: "2026-01-07",
      last_reviewed_at: "2026-01-01",
    });

    renderPage();
    await screen.findByText(/The mitochondria produces energy\./);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(await screen.findByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Good" }));

    await waitFor(() => expect(submitClozeReview).toHaveBeenCalledWith("d1", "c1", "good"));
    expect(await screen.findByText("Next review in 6 days.")).toBeInTheDocument();
  });

  test("the Review tab shows an empty state, with the lesson still fully readable, when nothing is due", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("The mitochondria produces energy."));
    listDueClozeCards.mockResolvedValue([]);

    renderPage();
    await screen.findByText(/The mitochondria produces energy\./);
    await userEvent.setup().click(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByText("You're all caught up — nothing to review right now."),
    ).toBeInTheDocument();
    // Unlike the old single-card view, the lesson text isn't replaced by
    // the empty-state message -- it's still there to read.
    expect(screen.getByText(/The mitochondria produces energy\./)).toBeInTheDocument();
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

  test("the notes panel lists all notes and lets the user open one to edit, alongside the lesson text", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listNotebookEntries.mockResolvedValue([
      { id: "n1", type: "text", content: "Existing note", strokes: null },
    ]);
    updateNotebookEntry.mockResolvedValue({
      id: "n1",
      type: "text",
      content: "Updated note",
      strokes: null,
    });

    renderPage();
    await screen.findByText("Hello world");
    const user = userEvent.setup();

    await user.click(await screen.findByText("Existing note"));
    // The notes panel is visible in parallel with the lesson text, not behind a tab.
    expect(screen.getByText("Hello world")).toBeInTheDocument();

    const textarea = await screen.findByDisplayValue("Existing note");
    await user.clear(textarea);
    await user.type(textarea, "Updated note");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Saved.");
    expect(updateNotebookEntry).toHaveBeenCalledWith("n1", { content: "Updated note" });
  });

  test("the notes panel shows an empty state and creates a new note tagged with the current lesson", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    createNotebookEntry.mockResolvedValue({
      id: "n2",
      type: "text",
      content: "New note",
      strokes: null,
    });

    renderPage();
    await screen.findByText("Hello world");
    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ Text" }));
    await user.type(screen.getByPlaceholderText("Title"), "New note");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createNotebookEntry).toHaveBeenCalledWith({
        type: "text",
        content: "New note",
        source_document_id: "d1",
      }),
    );
  });

  test("the notes panel collapses and expands via its toggle button", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText("Hello world");
    const user = userEvent.setup();

    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse notes" }));
    expect(screen.queryByText("No notes yet.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand notes" }));
    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
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
