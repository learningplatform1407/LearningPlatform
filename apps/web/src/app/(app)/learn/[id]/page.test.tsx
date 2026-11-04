import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/lib/theme";

import LecturePage from "./page";

const getDocument = vi.fn();
const createSignedUrl = vi.fn();
const listAnnotations = vi.fn();
const createAnnotation = vi.fn();
const deleteAnnotation = vi.fn();
const updateAnnotation = vi.fn();
const listQuestionBank = vi.fn();
const answerBankQuestion = vi.fn();
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
    updateAnnotation,
    deleteAnnotation,
    listQuestionBank,
    answerBankQuestion,
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

// PdfLessonView drives pdfjs-dist (worker, canvas rendering) which has no
// place in jsdom -- stubbed here so these tests can verify the page's mode
// toggle wiring (which component renders, with which props) without
// exercising real PDF rendering at all.
vi.mock("./pdf-lesson-view", () => ({
  PdfLessonView: ({ documentId, storagePath }: { documentId: string; storagePath: string }) => (
    <div data-testid="pdf-lesson-view">
      {documentId}:{storagePath}
    </div>
  ),
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

/** Matches a lesson paragraph by its whole text. In the reader every word is
 * its own span (word-level marking), so the text is never one node. */
function para(text: string) {
  return (_content: string, element: Element | null) =>
    element?.tagName === "P" && element.textContent === text;
}

function highlight(overrides: Record<string, unknown> = {}) {
  return {
    id: "h",
    document_version_id: "v1",
    type: "highlight",
    block_index: 0,
    start_offset: 0,
    end_offset: 5,
    note_text: null,
    color: "yellow",
    created_at: "2026-01-01",
    ...overrides,
  };
}

function note(overrides: Record<string, unknown> = {}) {
  return { ...highlight(), type: "margin_note", color: null, ...overrides };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "n",
    type: "text",
    content: "",
    strokes: null,
    source_document_id: "d1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** The highlight run (a <mark>) whose text is exactly `text`. */
function findMark(text: string) {
  return screen.findByText(
    (_content, element) => element?.tagName === "MARK" && element.textContent === text,
  );
}

/** A pointer drag across the lesson text, from one word to another, the
 * way a marking tool is used. */
function dragWords(from: string, to: string) {
  const word = (text: string) => screen.getAllByText(text, { selector: "[data-gi]" })[0]!;
  fireEvent.pointerDown(word(from), { button: 0, pointerId: 1 });
  fireEvent.pointerMove(word(to), { pointerId: 1 });
  fireEvent.pointerUp(word(to), { pointerId: 1 });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <LecturePage />
        </ToastProvider>
      </ThemeProvider>
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

/** A hidden cloze gap, hints on or off: "[ m___ ]" or "[ … ]". */
const GAP = /^\[ .+ \]$/;

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
    expect(screen.getByText(para("This is the body text."))).toBeInTheDocument();
  });

  test("the PDF/Text toggle does not appear when the lesson has no lecture PDF", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();

    expect(await screen.findByText(para("Hello world"))).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Lesson view mode" })).not.toBeInTheDocument();
  });

  test("switching to PDF mode renders the lecture PDF and hides the text content", async () => {
    getDocument.mockResolvedValue({
      ...readyDocumentWithParagraph("Hello world"),
      lecture_pdf: {
        status: "ready",
        error_message: null,
        storage_path: "lectures/book.pdf",
        page_count: 12,
      },
    });

    renderPage();

    expect(await screen.findByText(para("Hello world"))).toBeInTheDocument();
    const toggle = screen.getByRole("group", { name: "Lesson view mode" });

    fireEvent.click(within(toggle).getByRole("button", { name: "PDF" }));

    expect(await screen.findByTestId("pdf-lesson-view")).toHaveTextContent("d1:lectures/book.pdf");
    expect(screen.queryByText(para("Hello world"))).not.toBeInTheDocument();

    fireEvent.click(within(toggle).getByRole("button", { name: "Text" }));
    expect(await screen.findByText(para("Hello world"))).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-lesson-view")).not.toBeInTheDocument();
  });

  test.each(["failed", "processing"] as const)(
    "the PDF/Text toggle does not appear when the lecture PDF is %s",
    async (status) => {
      getDocument.mockResolvedValue({
        ...readyDocumentWithParagraph("Hello world"),
        lecture_pdf: {
          status,
          error_message: status === "failed" ? "Checksum mismatch" : null,
          storage_path: "lectures/book.pdf",
          page_count: 1,
        },
      });

      renderPage();

      // Offering the toggle for a PDF that never processed dead-ends the
      // learner in "Failed to load the lecture PDF." The text lesson is
      // still perfectly readable, so the PDF simply isn't offered.
      expect(await screen.findByText(para("Hello world"))).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Lesson view mode" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("pdf-lesson-view")).not.toBeInTheDocument();
    },
  );

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

  test("renders an existing highlight as a highlighted run", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([highlight({ id: "a1", start_offset: 6, end_offset: 11 })]);

    renderPage();

    const mark = await findMark("world");
    expect(mark).toBeInTheDocument();
    // The rest of the paragraph still renders as plain text around the highlight.
    expect(screen.getByText(para("Hello world"))).toBeInTheDocument();
  });

  test("a block-level margin note shows a note bubble that opens it in the Notebook", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      note({ id: "a1", start_offset: null, end_offset: null, note_text: "Remember this" }),
    ]);

    renderPage();

    const bubble = await screen.findByRole("button", { name: "Open note" });
    expect(screen.queryByDisplayValue("Remember this")).not.toBeInTheDocument();

    await userEvent.setup().click(bubble);

    expect(await screen.findByDisplayValue("Remember this")).toBeInTheDocument();
  });

  test("editing a margin note's text saves it in place, without recreating it", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      note({ id: "a1", start_offset: 6, end_offset: 11, note_text: "Remember this" }),
    ]);
    updateAnnotation.mockResolvedValue(note({ id: "a1", note_text: "Remember this too" }));

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open note" }));
    await user.type(await screen.findByDisplayValue("Remember this"), " too");
    await user.tab();

    await waitFor(() =>
      expect(updateAnnotation).toHaveBeenCalledWith("d1", "a1", { note_text: "Remember this too" }),
    );
    expect(deleteAnnotation).not.toHaveBeenCalled();
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  test("a range-anchored margin note is underlined with a bubble, not highlighted", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      note({ id: "a1", start_offset: 6, end_offset: 11, note_text: "Check this later" }),
    ]);

    const { container } = renderPage();

    await screen.findByRole("button", { name: "Open note" });
    expect(container.querySelector("mark")).toBeNull();
    expect(container.querySelector('[data-annotation-id="a1"]')).toHaveTextContent("world");
  });

  test("with the yellow marker on, dragging over words highlights exactly those words", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello brave world"));
    createAnnotation.mockResolvedValue(highlight({ id: "new" }));

    renderPage();
    await screen.findByText(para("Hello brave world"));

    await userEvent.setup().click(screen.getByRole("button", { name: "Highlight — yellow" }));
    dragWords("Hello", "brave");

    await waitFor(() =>
      expect(createAnnotation).toHaveBeenCalledWith("d1", {
        type: "highlight",
        block_index: 0,
        start_offset: 0,
        end_offset: 11,
        color: "yellow",
      }),
    );
  });

  test("a tap on a single word marks the whole word", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    createAnnotation.mockResolvedValue(highlight({ id: "new" }));

    renderPage();
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("button", { name: "Highlight — purple" }));
    dragWords("world", "world");

    await waitFor(() =>
      expect(createAnnotation).toHaveBeenCalledWith("d1", {
        type: "highlight",
        block_index: 0,
        start_offset: 6,
        end_offset: 11,
        color: "purple",
      }),
    );
  });

  test("a drag across paragraphs stores one highlight per paragraph", async () => {
    getDocument.mockResolvedValue({
      ...readyDocumentWithParagraph("ignored"),
      current_version: {
        id: "v1",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [
            { type: "paragraph", text: "First para here", page: 1 },
            { type: "heading", text: "Middle", page: 1 },
            { type: "paragraph", text: "Second one", page: 1 },
          ],
        },
        created_at: "2026-01-01",
      },
    });
    createAnnotation.mockResolvedValue(highlight({ id: "new" }));

    renderPage();
    await screen.findByText(para("First para here"));

    await userEvent.setup().click(screen.getByRole("button", { name: "Highlight — green" }));
    dragWords("para", "Second");

    await waitFor(() => expect(createAnnotation).toHaveBeenCalledTimes(2));
    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "highlight",
      block_index: 0,
      start_offset: 6,
      end_offset: 15,
      color: "green",
    });
    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "highlight",
      block_index: 2,
      start_offset: 0,
      end_offset: 6,
      color: "green",
    });
  });

  test("clicking an active colour again turns the marker off, and a drag then does nothing", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    const yellowButton = screen.getByRole("button", { name: "Highlight — yellow" });
    await user.click(yellowButton);
    expect(yellowButton).toHaveAttribute("aria-pressed", "true");

    await user.click(yellowButton);
    expect(yellowButton).toHaveAttribute("aria-pressed", "false");

    dragWords("Hello", "world");
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  test("choosing a different colour switches the marker instead of stacking", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    const yellowButton = screen.getByRole("button", { name: "Highlight — yellow" });
    const blueButton = screen.getByRole("button", { name: "Highlight — blue" });
    await user.click(yellowButton);
    await user.click(blueButton);

    expect(yellowButton).toHaveAttribute("aria-pressed", "false");
    expect(blueButton).toHaveAttribute("aria-pressed", "true");
  });

  test("the number keys pick a marker colour, and Escape puts it down", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    await user.keyboard("4");
    expect(screen.getByRole("button", { name: "Highlight — red" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Highlight — red" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("the eraser removes only the dragged-over part of a highlight, not unrelated ones", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("one two three four"));
    listAnnotations.mockResolvedValue([
      highlight({ id: "overlapping", start_offset: 0, end_offset: 18 }),
      highlight({ id: "far-away", block_index: 9, start_offset: 0, end_offset: 3 }),
    ]);
    createAnnotation.mockResolvedValue(highlight({ id: "rest" }));

    renderPage();
    await findMark("one two three four");

    await userEvent.setup().click(screen.getByRole("button", { name: "Eraser" }));
    dragWords("two", "three");

    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledWith("d1", "overlapping"));
    expect(deleteAnnotation).not.toHaveBeenCalledWith("d1", "far-away");
    // Erasing the middle leaves the two ends highlighted, as separate highlights.
    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "highlight",
      block_index: 0,
      start_offset: 0,
      end_offset: 4,
      note_text: null,
      color: "yellow",
    });
    expect(createAnnotation).toHaveBeenCalledWith("d1", {
      type: "highlight",
      block_index: 0,
      start_offset: 13,
      end_offset: 18,
      note_text: null,
      color: "yellow",
    });
  });

  test("erasing an entire highlight removes it with no remainder", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([highlight({ id: "a1", start_offset: 0, end_offset: 5 })]);

    renderPage();
    await findMark("Hello");

    await userEvent.setup().click(screen.getByRole("button", { name: "Eraser" }));
    dragWords("Hello", "Hello");

    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledWith("d1", "a1"));
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  test("Undo reverses the last highlight", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    createAnnotation.mockResolvedValue(highlight({ id: "fresh", start_offset: 0, end_offset: 5 }));

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Highlight — yellow" }));
    dragWords("Hello", "Hello");
    await waitFor(() => expect(createAnnotation).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Undo" })).not.toHaveAttribute("aria-disabled"),
    );
    await user.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledWith("d1", "fresh"));
  });

  test("a highlight renders with its stored colour, and legacy pink as red", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([
      highlight({ id: "a1", start_offset: 0, end_offset: 5, color: "green" }),
      highlight({ id: "a2", start_offset: 6, end_offset: 11, color: "pink" }),
    ]);

    renderPage();

    expect((await findMark("Hello")).className).toContain("bg-highlight4");
    expect((await findMark("world")).className).toContain("bg-highlight3");
  });

  test("the note tool anchors a note to the dragged passage and opens it in the Notebook", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    createAnnotation.mockResolvedValue(
      note({ id: "n-new", start_offset: 6, end_offset: 11, note_text: null }),
    );

    renderPage();
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("button", { name: "Note" }));
    dragWords("world", "world");

    await waitFor(() =>
      expect(createAnnotation).toHaveBeenCalledWith("d1", {
        type: "margin_note",
        block_index: 0,
        start_offset: 6,
        end_offset: 11,
        note_text: null,
      }),
    );
    expect(
      await screen.findByRole("complementary", { name: "Notebook and AI chat" }),
    ).toBeInTheDocument();
  });

  test("Explain is offered but says it's coming soon, and creates nothing", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("button", { name: "Explain" }));

    expect(screen.getByRole("status")).toHaveTextContent("AI explanations are coming soon.");
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  test("the pen is offered only in PDF mode, and says so in Text mode", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText(para("Hello world"));

    const pen = screen.getByRole("button", { name: "Pen" });
    expect(pen).toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().click(pen);
    expect(pen).not.toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("The pen draws on PDF pages.");
  });

  test("clicking a highlight with no tool does not delete it — only the eraser can", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listAnnotations.mockResolvedValue([highlight({ id: "a1", start_offset: 0, end_offset: 5 })]);

    renderPage();

    const mark = await findMark("Hello");
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
    const header = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(within(header).getByText(/Sub A/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chapter One" })).toHaveAttribute(
      "href",
      "/learn/library/b1/c1",
    );
  });

  test("omits the breadcrumb when the lesson is uncategorized", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();

    await screen.findByText(para("Hello world"));
    expect(screen.queryByRole("link", { name: /Chapter/ })).not.toBeInTheDocument();
  });

  test("a checked question's See in lesson paints its source, and the back bar returns to it", async () => {
    getDocument.mockResolvedValue(
      readyDocumentWithParagraph("Nitrates cause venodilation. This lowers preload."),
    );
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
        tags: [],
      },
    ]);
    answerBankQuestion.mockResolvedValue({
      prompt: "Which drug lowers preload?",
      kind: "single",
      points_awarded: 4,
      points_possible: 4,
      outcome: "correct",
      explanation: null,
      source_quotes: ["This lowers preload."],
      options: [
        {
          id: "a",
          text: "Nitrates",
          in_key: true,
          selected: true,
          classified_correctly: true,
          rationale: null,
        },
        {
          id: "b",
          text: "Vasopressors",
          in_key: false,
          selected: false,
          classified_correctly: true,
          rationale: null,
        },
      ],
    });

    renderPage();
    await screen.findByText(para("Nitrates cause venodilation. This lowers preload."));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Quizzes" }));

    // Not offered before checking: the passage would give the answer away.
    await user.click(await screen.findByText("Nitrates"));
    expect(screen.queryByRole("button", { name: "↗ See in lesson" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    await user.click(await screen.findByRole("button", { name: "↗ See in lesson" }));
    expect(screen.getByRole("tab", { name: "Lesson" })).toHaveAttribute("aria-selected", "true");
    const painted = [...document.querySelectorAll("[data-source]")].map((el) => el.textContent);
    expect(painted).toEqual(["This", "lowers", "preload."]);

    await user.click(screen.getByRole("button", { name: "← Back to quizzes" }));
    expect(screen.getByRole("tab", { name: "Quizzes" })).toHaveAttribute("aria-selected", "true");
    // Back to the same question, still showing its answer.
    expect(screen.getByText("correct — 4/4 points")).toBeVisible();
    expect(screen.queryByRole("button", { name: "← Back to quizzes" })).not.toBeInTheDocument();
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
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Quizzes" }));

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
    await screen.findByText(para("Hello world"));
    await userEvent.setup().click(screen.getByRole("tab", { name: "Quizzes" }));

    expect(await screen.findByLabelText("Answered correctly, 4 of 4 points")).toBeInTheDocument();
  });

  test("the Quizzes tab says so when the lesson has no questions", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listQuestionBank.mockResolvedValue([]);

    renderPage();
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Quizzes" }));

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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));

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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Flashcards" }));

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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Flashcards" }));

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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));

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

  test("each grade button shows the interval it would schedule", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([
      officialCard({ next_intervals: { again: 1, hard: 7, good: 15, easy: 40 } }),
    ]);

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
    await user.click(await screen.findByText("What is a CDN?"));

    expect(await screen.findByRole("button", { name: "Good, 15 days" })).toHaveTextContent(
      "Good15d",
    );
    expect(screen.getByRole("button", { name: "Easy, 40 days" })).toHaveTextContent("Easy1mo");
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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Flashcards" }));

    expect(await screen.findByRole("button", { name: "Retire" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  test("a failed grade is reported rather than silently doing nothing", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDueFlashcards.mockResolvedValue([officialCard()]);
    submitFlashcardReview.mockRejectedValue(new Error("offline"));

    renderPage();
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Flashcards" }));

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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
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
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Flashcards" }));

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
    await screen.findByText(para("Hello world"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "Flashcards" }));

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
    await screen.findByText(para("The mitochondria produces energy."));

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));

    // The whole lesson (heading included) stays visible during review, not
    // just the paragraph containing the due word.
    expect(await screen.findByText("Cell Biology")).toBeInTheDocument();
    expect(screen.getByText(GAP)).toBeInTheDocument();
    expect(screen.queryByText("mitochondria")).not.toBeInTheDocument();
    expect(screen.getByText("1 word left to review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(screen.getByText("mitochondria")).toBeInTheDocument();
    expect(screen.queryByText(GAP)).not.toBeInTheDocument();
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
    await screen.findByText(para("The database index accelerates lookups."));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));

    // Both due words start hidden, each as its own gap.
    expect(await screen.findAllByText(GAP)).toHaveLength(2);
    expect(screen.getByText("2 words left to review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("database")).toBeInTheDocument();
    expect(screen.getAllByText(GAP)).toHaveLength(1); // "index" still queued

    await user.click(screen.getByRole("button", { name: "Good" }));
    await waitFor(() => expect(screen.getByText("1 word left to review")).toBeInTheDocument());
    // A graded word stays in the text, tinted with its grade, for the
    // rest of the session.
    expect(screen.getByText("database")).toHaveClass("text-good");
    expect(screen.getByText(GAP)).toBeInTheDocument(); // "index" still hidden, Show not pressed yet

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("index")).toBeInTheDocument();
    expect(screen.queryByText(GAP)).not.toBeInTheDocument();
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
    await screen.findByText(para("The mitochondria produces energy."));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));
    await user.click(await screen.findByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Good" }));

    await waitFor(() => expect(submitClozeReview).toHaveBeenCalledWith("d1", "c1", "good"));
    expect(await screen.findByText("Next review in 6 days.")).toBeInTheDocument();
  });

  test("Space reveals and the number keys grade, from the keyboard", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("The mitochondria produces energy."));
    listDueClozeCards.mockResolvedValue([
      { id: "c1", document_id: "d1", block_index: 0, start_offset: 4, end_offset: 16 },
    ]);
    submitClozeReview.mockResolvedValue({
      id: "s1",
      cloze_card_id: "c1",
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 1,
      due_at: "2026-01-02",
      last_reviewed_at: "2026-01-01",
    });

    renderPage();
    await screen.findByText(para("The mitochondria produces energy."));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));
    await screen.findByRole("button", { name: "Show" });

    await user.keyboard(" ");
    expect(screen.getByText("mitochondria")).toBeInTheDocument();
    await user.keyboard("2");

    await waitFor(() => expect(submitClozeReview).toHaveBeenCalledWith("d1", "c1", "hard"));
  });

  test("'Only what you missed' brings back the words graded Again or Hard", async () => {
    getDocument.mockResolvedValue(
      readyDocumentWithParagraph("The database index accelerates lookups."),
    );
    listDueClozeCards.mockResolvedValue([
      { id: "c1", document_id: "d1", block_index: 0, start_offset: 4, end_offset: 12 },
      { id: "c2", document_id: "d1", block_index: 0, start_offset: 13, end_offset: 18 },
    ]);
    submitClozeReview.mockResolvedValue({
      id: "s",
      cloze_card_id: "c",
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 1,
      due_at: "2026-01-02",
      last_reviewed_at: "2026-01-01",
    });

    renderPage();
    await screen.findByText(para("The database index accelerates lookups."));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));

    await user.click(await screen.findByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Again" }));
    await user.click(await screen.findByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Good" }));
    expect(
      await screen.findByText("You're all caught up — nothing to review right now."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Only what you missed" }));

    expect(screen.getByText("1 missed word to go again")).toBeInTheDocument();
    expect(screen.getAllByText(GAP)).toHaveLength(1);
    expect(screen.getByText("index")).toBeInTheDocument();
  });

  test("gaps hint the first letter and length, and the bulb dot hides the hints", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("The femur is the longest bone."));
    listDueClozeCards.mockResolvedValue([
      { id: "c1", document_id: "d1", block_index: 0, start_offset: 4, end_offset: 9 },
    ]);

    renderPage();
    await screen.findByText(para("The femur is the longest bone."));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));

    expect(await screen.findByText("[ f____ ]")).toBeInTheDocument();
    const hints = screen.getByRole("button", { name: "Letter hints in the gaps" });
    expect(hints).toHaveAttribute("aria-pressed", "true");

    await user.click(hints);
    expect(screen.getByText("[ … ]")).toBeInTheDocument();
    expect(screen.queryByText("[ f____ ]")).not.toBeInTheDocument();
  });

  test("the cards view shows only the sentence holding the gap", async () => {
    getDocument.mockResolvedValue(
      readyDocumentWithParagraph("Bones heal slowly. The femur is the longest bone. Rest helps."),
    );
    listDueClozeCards.mockResolvedValue([
      { id: "c1", document_id: "d1", block_index: 0, start_offset: 23, end_offset: 28 },
    ]);

    renderPage();
    await screen.findByText(para("Bones heal slowly. The femur is the longest bone. Rest helps."));
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));
    await user.click(await screen.findByRole("button", { name: "Cards, one at a time" }));

    const card = screen.getByRole("dialog", { name: "Review card" });
    expect(card).toHaveTextContent("The [ f____ ] is the longest bone.");
    expect(card).not.toHaveTextContent("Bones heal slowly");
    expect(card).not.toHaveTextContent("Rest helps");
  });

  test("the Review tab shows an empty state, with the lesson still fully readable, when nothing is due", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("The mitochondria produces energy."));
    listDueClozeCards.mockResolvedValue([]);

    renderPage();
    await screen.findByText(para("The mitochondria produces energy."));
    await userEvent.setup().click(screen.getByRole("tab", { name: "Review" }));

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
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Quizzes" }));
    expect(screen.queryByText(para("Hello world"))).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Lesson" }));
    expect(await screen.findByText(para("Hello world"))).toBeInTheDocument();
  });

  test("the Notebook pages through this lesson's notes and saves an edit when you leave it", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listNotebookEntries.mockResolvedValue([
      entry({ id: "n1", content: "First note", created_at: "2026-01-01T10:00:00Z" }),
      entry({ id: "n2", content: "Second note", created_at: "2026-01-02T10:00:00Z" }),
      entry({ id: "other", content: "Another lesson's", source_document_id: "d9" }),
    ]);
    updateNotebookEntry.mockResolvedValue(entry({ id: "n1", content: "First note, edited" }));

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Notebook and AI chat" }));
    expect(await screen.findByText("Note 1 of 2")).toBeInTheDocument();
    // The notebook panel opens over the lesson, which stays readable.
    expect(screen.getByText(para("Hello world"))).toBeInTheDocument();

    const textarea = screen.getByRole("textbox", { name: "Note" });
    expect(textarea).toHaveValue("First note");
    await user.type(textarea, ", edited");
    await user.click(screen.getByRole("button", { name: "Next note" }));

    expect(updateNotebookEntry).toHaveBeenCalledWith("n1", { content: "First note, edited" });
    expect(await screen.findByText("Note 2 of 2")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Another lesson's")).not.toBeInTheDocument();
  });

  test("+ starts a note tagged with this lesson; an empty one is never created", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    createNotebookEntry.mockResolvedValue(entry({ id: "n2", content: "New note" }));

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Notebook and AI chat" }));
    expect(await screen.findByText(/No notes for this lesson yet/)).toBeInTheDocument();

    // Opened and left empty: nothing is created.
    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.click(screen.getByRole("button", { name: "Delete note" }));
    expect(createNotebookEntry).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "New note");
    await user.tab();

    await waitFor(() =>
      expect(createNotebookEntry).toHaveBeenCalledWith({
        type: "text",
        content: "New note",
        source_document_id: "d1",
      }),
    );
  });

  test("the edge button opens and closes the panel, and Chat AI says it's coming soon", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();
    const edge = screen.getByRole("button", { name: "Notebook and AI chat" });

    expect(edge).toHaveAttribute("aria-expanded", "false");
    await user.click(edge);
    expect(edge).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("tab", { name: "Chat AI" }));
    expect(screen.getByText("AI chat is coming soon.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask about this lesson" })).toBeDisabled();

    await user.click(edge);
    expect(
      screen.queryByRole("complementary", { name: "Notebook and AI chat" }),
    ).not.toBeInTheDocument();
  });

  test("the table of contents lists this lesson's headings and the sub-chapter's lessons", async () => {
    getDocument.mockResolvedValue({
      ...readyDocumentWithParagraph("Hello world"),
      current_version: {
        id: "v1",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [
            { type: "heading", text: "Fracture types", page: 1 },
            { type: "paragraph", text: "Hello world", page: 1 },
          ],
        },
        created_at: "2026-01-01",
      },
      sub_chapter: { id: "sc1", title: "Sub A", chapter: { id: "c1", title: "Chapter One" } },
    });
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Intro to Systems", created_at: "2026-01-01", status: "ready" },
      { id: "d2", title: "Second lesson", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();
    await screen.findByText(para("Hello world"));
    const user = userEvent.setup();

    expect(screen.queryByRole("navigation", { name: "Table of contents" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show contents" }));

    const toc = screen.getByRole("navigation", { name: "Table of contents" });
    expect(within(toc).getByRole("button", { name: "Fracture types" })).toBeInTheDocument();
    expect(await within(toc).findByRole("link", { name: "Second lesson" })).toHaveAttribute(
      "href",
      "/learn/d2",
    );
    expect(listDocuments).toHaveBeenCalledWith("sc1");
    expect(within(toc).getByRole("link", { name: "Intro to Systems" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(toc).getByRole("link", { name: "Second lesson" })).not.toHaveAttribute(
      "aria-current",
    );

    await user.click(screen.getByRole("button", { name: "Hide contents" }));
    expect(screen.queryByRole("navigation", { name: "Table of contents" })).toBeNull();
  });

  test("the table of contents falls back to the Uncategorized bucket when the lesson has no sub-chapter", async () => {
    getDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Intro to Systems", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();
    await screen.findByText(para("Hello world"));
    await userEvent.setup().click(screen.getByRole("button", { name: "Show contents" }));

    await waitFor(() => expect(listDocuments).toHaveBeenCalledWith("none"));
  });

  test("the back dot returns to the lesson's book in the library", async () => {
    getDocument.mockResolvedValue({
      ...readyDocumentWithParagraph("Hello world"),
      sub_chapter: {
        id: "sc1",
        title: "Sub A",
        chapter: { id: "c1", book_id: "b1", title: "Chapter One" },
      },
    });

    renderPage();
    await screen.findByText(para("Hello world"));

    expect(screen.getByRole("link", { name: "Back to the library" })).toHaveAttribute(
      "href",
      "/learn/library/b1",
    );
  });
});
