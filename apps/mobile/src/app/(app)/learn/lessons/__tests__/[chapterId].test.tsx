import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { TextInput } from "react-native";

import ChapterLessonsScreen from "../[chapterId]";

const mockGetMe = jest.fn();
const mockListChapters = jest.fn();
const mockListDocuments = jest.fn();
const mockRequestDocumentUploadUrl = jest.fn();
const mockCreateDocument = jest.fn();
const mockUploadToSignedUrl = jest.fn();

let mockChapterId = "c1";

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    listChapters: mockListChapters,
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
      <ChapterLessonsScreen />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };
const CHAPTERS = [{ id: "c1", title: "Intro to Systems", order_index: 0, lesson_count: 1 }];

beforeEach(() => {
  mockChapterId = "c1";
  (useLocalSearchParams as jest.Mock).mockImplementation(() => ({ chapterId: mockChapterId }));
  mockGetMe.mockReset();
  mockListChapters.mockReset().mockResolvedValue(CHAPTERS);
  mockListDocuments.mockReset();
  mockRequestDocumentUploadUrl.mockReset();
  mockCreateDocument.mockReset();
  mockUploadToSignedUrl.mockReset();
  (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
  (router.push as jest.Mock).mockReset();
});

test("renders the chapter title and its lesson list once loaded", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListDocuments.mockResolvedValue([
    { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
  ]);

  renderScreen();

  expect(await screen.findByText("Intro to Systems")).toBeTruthy();
  expect(screen.getByText("Lesson 1")).toBeTruthy();
  expect(screen.getByText("Ready")).toBeTruthy();
  expect(mockListDocuments).toHaveBeenCalledWith("c1");
});

test("shows an empty state when there are no lessons", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListDocuments.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("No lessons yet.")).toBeTruthy();
});

test("navigates to the lesson reader when a row is pressed", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListDocuments.mockResolvedValue([
    { id: "d1", title: "Lesson 1", created_at: "2026-01-01", status: "ready" },
  ]);

  renderScreen();
  fireEvent.press(await screen.findByText("Lesson 1"));

  expect(router.push).toHaveBeenCalledWith("/learn/d1");
});

test("hides the upload form for a non-admin", async () => {
  mockGetMe.mockResolvedValue(STUDENT_ME);
  mockListDocuments.mockResolvedValue([]);

  renderScreen();

  await screen.findByText("No lessons yet.");
  expect(screen.queryByText("Upload a lesson")).toBeNull();
});

test("shows the upload form for an admin", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListDocuments.mockResolvedValue([]);

  renderScreen();

  expect(await screen.findByText("Upload a lesson")).toBeTruthy();
});

test("uploads a picked PDF through requestUploadUrl -> storage -> createDocument, tagged with the chapter", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListDocuments.mockResolvedValue([]);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///lesson.pdf", name: "lesson.pdf", size: 1234, mimeType: "application/pdf" }],
  });
  mockRequestDocumentUploadUrl.mockResolvedValue({ storage_path: "abc.pdf", token: "tok" });
  mockUploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
  mockCreateDocument.mockResolvedValue({ id: "d1", title: "New Lesson" });
  globalThis.fetch = jest.fn().mockResolvedValue({
    blob: () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  }) as unknown as typeof fetch;

  renderScreen();

  await screen.findByText("Upload a lesson");
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "New Lesson");
  fireEvent.press(screen.getByText("Choose PDF file"));
  await screen.findByText("lesson.pdf");

  fireEvent.press(screen.getByRole("button", { name: "Upload" }));

  await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
  expect(mockRequestDocumentUploadUrl).toHaveBeenCalledWith({
    filename: "lesson.pdf",
    mime_type: "application/pdf",
    size_bytes: 1234,
  });
  expect(mockUploadToSignedUrl).toHaveBeenCalledWith("abc.pdf", "tok", expect.anything(), {
    contentType: "application/pdf",
  });
  const createCall = (mockCreateDocument.mock.calls[0] ?? [])[0];
  expect(createCall.title).toBe("New Lesson");
  expect(createCall.chapter_id).toBe("c1");
  expect(createCall.checksum).toBe("a".repeat(64));
});

test("rejects a non-PDF file before calling the API", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListDocuments.mockResolvedValue([]);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///notes.txt", name: "notes.txt", size: 10, mimeType: "text/plain" }],
  });

  renderScreen();

  await screen.findByText("Upload a lesson");
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "New Lesson");
  fireEvent.press(screen.getByText("Choose PDF file"));
  await screen.findByText("notes.txt");

  fireEvent.press(screen.getByRole("button", { name: "Upload" }));

  expect(await screen.findByText("Only PDF files are supported.")).toBeTruthy();
  expect(mockRequestDocumentUploadUrl).not.toHaveBeenCalled();
});

test("the Uncategorized bucket lists chapterless lessons and uploads without a chapter_id", async () => {
  mockChapterId = "uncategorized";
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

  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "Another loose lesson");
  fireEvent.press(screen.getByText("Choose PDF file"));
  await screen.findByText("lesson.pdf");
  fireEvent.press(screen.getByRole("button", { name: "Upload" }));

  await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
  expect(mockCreateDocument.mock.calls[0]![0].chapter_id).toBeUndefined();
});
