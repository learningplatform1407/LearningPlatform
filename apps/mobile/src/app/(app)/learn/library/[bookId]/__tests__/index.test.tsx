import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { TextInput } from "react-native";

import BookScreen from "../index";

const mockGetMe = jest.fn();
const mockListChapters = jest.fn();
const mockCreateChapter = jest.fn();
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

beforeEach(() => {
  mockBookId = "b1";
  (useLocalSearchParams as jest.Mock).mockImplementation(() => ({ bookId: mockBookId }));
  mockGetMe.mockReset();
  mockListChapters.mockReset().mockResolvedValue([]);
  mockCreateChapter.mockReset();
  mockListDocuments.mockReset().mockResolvedValue([]);
  mockRequestDocumentUploadUrl.mockReset();
  mockCreateDocument.mockReset();
  mockUploadToSignedUrl.mockReset();
  (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
  (router.push as jest.Mock).mockReset();
});

describe("BookScreen (real book)", () => {
  test("renders chapters scoped to the book and navigates on press", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);
    mockListChapters.mockResolvedValue([
      { id: "c1", book_id: "b1", title: "Intro to Systems", order_index: 0, sub_chapter_count: 3 },
    ]);

    renderScreen();

    expect(await screen.findByText("Intro to Systems")).toBeTruthy();
    expect(screen.getByText("3 sub-chapters")).toBeTruthy();
    expect(mockListChapters).toHaveBeenCalledWith("b1");

    fireEvent.press(screen.getByText("Intro to Systems"));
    expect(router.push).toHaveBeenCalledWith("/learn/library/b1/c1");
  });

  test("shows an empty state when the book has no chapters", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();

    expect(await screen.findByText("No chapters yet.")).toBeTruthy();
  });

  test("hides the new-chapter form for a non-admin", async () => {
    mockGetMe.mockResolvedValue(STUDENT_ME);

    renderScreen();

    await screen.findByText("No chapters yet.");
    expect(screen.queryByText("New chapter")).toBeNull();
  });

  test("an admin can create a new chapter scoped to this book", async () => {
    mockGetMe.mockResolvedValue(ADMIN_ME);
    mockCreateChapter.mockResolvedValue({
      id: "c1",
      book_id: "b1",
      title: "New Chapter",
      order_index: 0,
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
      assets: [{ uri: "file:///lesson.pdf", name: "lesson.pdf", size: 1234, mimeType: "application/pdf" }],
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
