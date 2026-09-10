import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import LectureScreen from "../[id]";

const mockGetDocument = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockListAnnotations = jest.fn();
const mockCreateAnnotation = jest.fn();
const mockDeleteAnnotation = jest.fn();
const mockListQuizzes = jest.fn();
const mockListFlashcards = jest.fn();
const mockGetNote = jest.fn();
const mockUpsertNote = jest.fn();
const mockListDocuments = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getDocument: mockGetDocument,
    listAnnotations: mockListAnnotations,
    createAnnotation: mockCreateAnnotation,
    deleteAnnotation: mockDeleteAnnotation,
    listQuizzes: mockListQuizzes,
    listFlashcards: mockListFlashcards,
    getNote: mockGetNote,
    upsertNote: mockUpsertNote,
    listDocuments: mockListDocuments,
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) } },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ id: "d1" }),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LectureScreen />
    </QueryClientProvider>,
  );
}

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

beforeEach(() => {
  mockGetDocument.mockReset();
  mockCreateSignedUrl.mockReset();
  mockListAnnotations.mockReset().mockResolvedValue([]);
  mockCreateAnnotation.mockReset().mockResolvedValue({});
  mockDeleteAnnotation.mockReset().mockResolvedValue(undefined);
  mockListQuizzes.mockReset().mockResolvedValue([]);
  mockListFlashcards.mockReset().mockResolvedValue([]);
  mockGetNote.mockReset().mockResolvedValue(null);
  mockUpsertNote
    .mockReset()
    .mockResolvedValue({ document_id: "d1", content: "", updated_at: "2026-01-01" });
  mockListDocuments.mockReset().mockResolvedValue([]);
  (router.push as jest.Mock).mockReset();
});

test("renders extracted headings and paragraphs when ready", async () => {
  mockGetDocument.mockResolvedValue({
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

  renderScreen();

  expect(await screen.findByText("Intro to Systems")).toBeTruthy();
  expect(await screen.findByText("Introduction")).toBeTruthy();
  expect(screen.getByText("This is the body text.")).toBeTruthy();
});

test("shows a processing message while still processing", async () => {
  mockGetDocument.mockResolvedValue({
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

  renderScreen();

  expect(await screen.findByText("Processing...")).toBeTruthy();
});

test("shows the error message when processing failed", async () => {
  mockGetDocument.mockResolvedValue({
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

  renderScreen();

  expect(await screen.findByText(/No extractable text found/)).toBeTruthy();
});

test("shows a fetch error", async () => {
  mockGetDocument.mockRejectedValue(new Error("Not found"));

  renderScreen();

  expect(await screen.findByText(/Not found/)).toBeTruthy();
});

test("renders an image block using a signed URL", async () => {
  mockGetDocument.mockResolvedValue({
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
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example.com/v1/images/1.png" },
    error: null,
  });

  renderScreen();

  const image = await screen.findByTestId("extracted-image");
  expect(image.props.source.uri).toBe("https://signed.example.com/v1/images/1.png");
  expect(mockCreateSignedUrl).toHaveBeenCalledWith("v1/images/1.png", 3600);
});

test("shows an error if the signed URL request fails", async () => {
  mockGetDocument.mockResolvedValue({
    id: "d1",
    title: "Intro to Systems",
    current_version: {
      id: "v1",
      status: "ready",
      error_message: null,
      extracted_content: { blocks: [{ type: "image", page: 1, image_path: "v1/images/1.png" }] },
      created_at: "2026-01-01",
    },
  });
  mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error("expired") });

  renderScreen();

  expect(await screen.findByText("Failed to load image.")).toBeTruthy();
});

test("renders an existing highlight created on web as a highlighted span", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
  mockListAnnotations.mockResolvedValue([
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

  renderScreen();

  expect(await screen.findByText("world")).toBeTruthy();
  expect(screen.getByText("Hello ")).toBeTruthy();
});

test("renders a range-anchored margin note (created on web) as a badge, not a highlight", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
  mockListAnnotations.mockResolvedValue([
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

  renderScreen();

  expect(await screen.findByText("note")).toBeTruthy();
  // Split into segments by the note's offsets, but rendered as plain (unhighlighted) text.
  expect(screen.getByText("Hello ")).toBeTruthy();
  expect(screen.getByText("world")).toBeTruthy();
});

test("renders an existing margin note as a badge and reveals its text when pressed", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
  mockListAnnotations.mockResolvedValue([
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

  renderScreen();

  const badge = await screen.findByText("note");
  expect(screen.queryByText("Remember this")).toBeNull();

  fireEvent.press(badge);

  expect(await screen.findByText("Remember this")).toBeTruthy();
});

test("long-pressing a paragraph opens the note composer and saves a block-level note", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

  renderScreen();

  await screen.findByText("Hello world");
  fireEvent(screen.getByTestId("paragraph-0"), "longPress");

  const input = await screen.findByPlaceholderText("Note...");
  fireEvent.changeText(input, "Check this later");
  fireEvent.press(screen.getByText("Save"));

  await waitFor(() =>
    expect(mockCreateAnnotation).toHaveBeenCalledWith("d1", {
      type: "margin_note",
      block_index: 0,
      note_text: "Check this later",
    }),
  );
});

test("deleting a note from its modal calls the delete endpoint", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
  mockListAnnotations.mockResolvedValue([
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

  renderScreen();

  fireEvent.press(await screen.findByText("note"));
  fireEvent.press(await screen.findByText("Delete"));

  await waitFor(() => expect(mockDeleteAnnotation).toHaveBeenCalledWith("d1", "a1"));
});

test("renders a chapter / sub-chapter breadcrumb when the lesson is organized", async () => {
  mockGetDocument.mockResolvedValue({
    ...readyDocumentWithParagraph("Hello world"),
    sub_chapter: {
      id: "sc1",
      title: "Sub A",
      chapter: { id: "c1", title: "Chapter One" },
    },
  });

  renderScreen();

  expect(await screen.findByText("Chapter One / Sub A")).toBeTruthy();
});

test("omits the breadcrumb when the lesson is uncategorized", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

  renderScreen();

  await screen.findByText("Hello world");
  expect(screen.queryByText(/Chapter One/)).toBeNull();
});

test("switching to the Quizzes tab shows a Coming soon placeholder", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Quizzes"));

  expect(await screen.findByText("Coming soon.")).toBeTruthy();
  expect(mockListQuizzes).toHaveBeenCalledWith("d1");
});

test("switching to the Flashcards tab shows a Coming soon placeholder", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Flashcards"));

  expect(await screen.findByText("Coming soon.")).toBeTruthy();
  expect(mockListFlashcards).toHaveBeenCalledWith("d1");
});

test("switching back to the Lesson tab restores the reader content", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Quizzes"));
  expect(screen.queryByText("Hello world")).toBeNull();

  fireEvent.press(screen.getByText("Lesson"));
  expect(await screen.findByText("Hello world")).toBeTruthy();
});

test("the Notes overlay loads the existing note and saves edits", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
  mockGetNote.mockResolvedValue({
    document_id: "d1",
    content: "Existing note",
    updated_at: "2026-01-01",
  });
  mockUpsertNote.mockResolvedValue({
    document_id: "d1",
    content: "Updated note",
    updated_at: "2026-01-02",
  });

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Notes"));

  const textarea = await screen.findByPlaceholderText("Write your notes for this lesson...");
  expect(textarea.props.value).toBe("Existing note");

  fireEvent.changeText(textarea, "Updated note");
  fireEvent.press(screen.getByText("Save"));

  await screen.findByText("Saved.");
  expect(mockUpsertNote).toHaveBeenCalledWith("d1", "Updated note");
});

test("the Notes overlay starts empty when the lesson has no note yet", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
  mockGetNote.mockResolvedValue(null);

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Notes"));

  const textarea = await screen.findByPlaceholderText("Write your notes for this lesson...");
  expect(textarea.props.value).toBe("");
});

test("the Notes overlay closes via its Close button", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Notes"));
  await screen.findByPlaceholderText("Write your notes for this lesson...");

  fireEvent.press(screen.getByText("Close"));

  await waitFor(() =>
    expect(screen.queryByPlaceholderText("Write your notes for this lesson...")).toBeNull(),
  );
});

test("the Contents overlay lists the current sub-chapter's lessons and navigates on press", async () => {
  mockGetDocument.mockResolvedValue({
    ...readyDocumentWithParagraph("Hello world"),
    sub_chapter: { id: "sc1", title: "Sub A", chapter: { id: "c1", title: "Chapter One" } },
  });
  mockListDocuments.mockResolvedValue([
    { id: "d1", title: "Intro to Systems", created_at: "2026-01-01", status: "ready" },
    { id: "d2", title: "Second lesson", created_at: "2026-01-01", status: "ready" },
  ]);

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Contents"));

  await screen.findByText("Second lesson");
  expect(mockListDocuments).toHaveBeenCalledWith("sc1");

  fireEvent.press(screen.getByText("Second lesson"));

  expect(router.push).toHaveBeenCalledWith("/learn/d2");
});

test("the Contents overlay falls back to the Uncategorized bucket when the lesson has no sub-chapter", async () => {
  mockGetDocument.mockResolvedValue(readyDocumentWithParagraph("Hello world"));
  mockListDocuments.mockResolvedValue([
    { id: "d1", title: "Intro to Systems", created_at: "2026-01-01", status: "ready" },
  ]);

  renderScreen();
  await screen.findByText("Hello world");

  fireEvent.press(screen.getByText("Contents"));

  await waitFor(() => expect(mockListDocuments).toHaveBeenCalledWith("none"));
});
