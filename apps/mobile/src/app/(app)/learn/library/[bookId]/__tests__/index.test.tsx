import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { TextInput } from "react-native";

import BookScreen from "../index";

const mockGetMe = jest.fn();
const mockListChapters = jest.fn();
const mockCreateChapter = jest.fn();
const mockListSubChapters = jest.fn();
const mockCreateSubChapter = jest.fn();
const mockListDocuments = jest.fn();
const mockRequestDocumentUploadUrl = jest.fn();
const mockCreateDocument = jest.fn();
const mockUploadToSignedUrl = jest.fn();

let mockBookId = "b1";

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    listChapters: mockListChapters,
    createChapter: mockCreateChapter,
    listSubChapters: mockListSubChapters,
    createSubChapter: mockCreateSubChapter,
    listDocuments: mockListDocuments,
    requestDocumentUploadUrl: mockRequestDocumentUploadUrl,
    createDocument: mockCreateDocument,
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ uploadToSignedUrl: mockUploadToSignedUrl }) } },
}));

jest.mock("@/lib/checksum", () => ({
  sha256Hex: jest.fn().mockResolvedValue("a".repeat(64)),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookScreen />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };
const CHAPTERS = [
  { id: "c1", book_id: "b1", title: "Intro to Systems", order_index: 0, sub_chapter_count: 1 },
];
const SUB_CHAPTERS = [
  { id: "sc1", chapter_id: "c1", title: "Sub A", order_index: 0, lesson_count: 1 },
];

beforeEach(() => {
  mockBookId = "b1";
  (useLocalSearchParams as jest.Mock).mockImplementation(() => ({ bookId: mockBookId }));
  mockGetMe.mockReset();
  mockListChapters.mockReset().mockResolvedValue(CHAPTERS);
  mockCreateChapter.mockReset();
  mockListSubChapters.mockReset().mockResolvedValue(SUB_CHAPTERS);
  mockCreateSubChapter.mockReset();
  mockListDocuments.mockReset().mockResolvedValue([]);
  mockRequestDocumentUploadUrl.mockReset();
  mockCreateDocument.mockReset();
  mockUploadToSignedUrl.mockReset();
  (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
  (router.push as jest.Mock).mockReset();
});

describe("BookScreen (real book)", () => {
  test("renders chapters scoped to the book, collapsed by default", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();

    expect(await screen.findByText("Intro to Systems")).toBeTruthy();
    expect(screen.getByText(/1 sub-chapter/)).toBeTruthy();
    expect(mockListChapters).toHaveBeenCalledWith("b1");
    expect(mockListSubChapters).not.toHaveBeenCalled();
  });

  test("shows an empty state when the book has no chapters", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListChapters.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText("No chapters yet.")).toBeTruthy();
  });

  test("hides the new-chapter form for a non-admin", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();

    await screen.findByText("Intro to Systems");
    expect(screen.queryByText("New chapter")).toBeNull();
  });

  test("an admin can create a new chapter scoped to this book", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockCreateChapter.mockResolvedValue({
      id: "c2",
      book_id: "b1",
      title: "New Chapter",
      order_index: 1,
      sub_chapter_count: 0,
    });

    renderScreen();

    await screen.findByText("New chapter");
    fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "New Chapter");
    fireEvent.press(screen.getByRole("button", { name: "Create chapter" }));

    await waitFor(() =>
      expect(mockCreateChapter).toHaveBeenCalledWith("b1", { title: "New Chapter" }),
    );
  });

  test("expanding a chapter lazily loads and shows its sub-chapters", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    expect(await screen.findByText("Sub A")).toBeTruthy();
    expect(mockListSubChapters).toHaveBeenCalledWith("c1");
  });

  test("expanding a sub-chapter inside an expanded chapter lazily loads its lessons", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));

    expect(await screen.findByText("Lesson 1")).toBeTruthy();
    expect(mockListDocuments).toHaveBeenCalledWith("sc1");
  });

  test("navigates to the lesson reader when a lesson row is pressed", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
    ]);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));
    fireEvent.press(await screen.findByText("Lesson 1"));

    expect(router.push).toHaveBeenCalledWith("/learn/d1");
  });

  test("shows an empty state when there are no sub-chapters", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListSubChapters.mockResolvedValue([]);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    expect(await screen.findByText("No sub-chapters yet.")).toBeTruthy();
  });

  test("hides the new-sub-chapter form for a non-admin", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    await screen.findByText("Sub A");
    expect(screen.queryByText("New sub-chapter")).toBeNull();
  });

  test("an admin can create a new sub-chapter inside an expanded chapter", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockCreateSubChapter.mockResolvedValue({
      id: "sc2",
      chapter_id: "c1",
      title: "Sub B",
      order_index: 1,
      lesson_count: 0,
    });

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));

    await screen.findByText("New sub-chapter");
    fireEvent.changeText(screen.getByTestId("sub-chapter-title-input"), "Sub B");
    fireEvent.press(screen.getByRole("button", { name: "Create sub-chapter" }));

    await waitFor(() =>
      expect(mockCreateSubChapter).toHaveBeenCalledWith("c1", { title: "Sub B" }),
    );
  });

  test("uploading a lesson inside an expanded sub-chapter tags it with sub_chapter_id", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///lesson.pdf", name: "lesson.pdf", size: 1234, mimeType: "application/pdf" },
      ],
    });
    mockRequestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    mockUploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    mockCreateDocument.mockResolvedValue({ id: "d1", title: "New Lesson" });
    globalThis.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    }) as unknown as typeof fetch;

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));

    await screen.findByText("Upload a lesson");
    fireEvent.changeText(screen.getByTestId("lesson-title-input"), "New Lesson");
    fireEvent.press(screen.getByText("Choose PDF file"));
    await screen.findByText("lesson.pdf");

    fireEvent.press(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
    const createCall = (mockCreateDocument.mock.calls[0] ?? [])[0];
    expect(createCall.title).toBe("New Lesson");
    expect(createCall.sub_chapter_id).toBe("sc1");
    expect(createCall.checksum).toBe("a".repeat(64));
  });

  test("rejects a non-PDF file before calling the API", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///notes.txt", name: "notes.txt", size: 10, mimeType: "text/plain" }],
    });

    renderScreen();
    fireEvent.press(await screen.findByText("Intro to Systems"));
    fireEvent.press(await screen.findByText("Sub A"));

    await screen.findByText("Upload a lesson");
    fireEvent.changeText(screen.getByTestId("lesson-title-input"), "New Lesson");
    fireEvent.press(screen.getByText("Choose PDF file"));
    await screen.findByText("notes.txt");

    fireEvent.press(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("Only PDF files are supported.")).toBeTruthy();
    expect(mockRequestDocumentUploadUrl).not.toHaveBeenCalled();
  });
});

describe("BookScreen (Uncategorized)", () => {
  beforeEach(() => {
    mockBookId = "uncategorized";
  });

  test("lists chapterless lessons directly, no book/chapter fetch, and uploads without a sub_chapter_id", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockListDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///lesson.pdf", name: "lesson.pdf", size: 1234, mimeType: "application/pdf" },
      ],
    });
    mockRequestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
    mockUploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    mockCreateDocument.mockResolvedValue({ id: "d2", title: "Another loose lesson" });
    globalThis.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    }) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText("Uncategorized")).toBeTruthy();
    expect(screen.getByText("Loose lesson")).toBeTruthy();
    expect(mockListDocuments).toHaveBeenCalledWith("none");
    expect(mockListChapters).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId("lesson-title-input"), "Another loose lesson");
    fireEvent.press(screen.getByText("Choose PDF file"));
    await screen.findByText("lesson.pdf");
    fireEvent.press(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
    expect(mockCreateDocument.mock.calls[0]![0].sub_chapter_id).toBeUndefined();
  });
});
