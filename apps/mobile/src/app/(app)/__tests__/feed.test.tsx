import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";

import FeedScreen from "../feed";

const mockGetMe = jest.fn();
const mockListFeed = jest.fn();
const mockCreateFeedPost = jest.fn();
const mockUpdateFeedPost = jest.fn();
const mockDeleteFeedPost = jest.fn();
const mockRequestFeedImageUploadUrl = jest.fn();
const mockUploadToSignedUrl = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getMe: mockGetMe,
    listFeed: mockListFeed,
    createFeedPost: mockCreateFeedPost,
    updateFeedPost: mockUpdateFeedPost,
    deleteFeedPost: mockDeleteFeedPost,
    requestFeedImageUploadUrl: mockRequestFeedImageUploadUrl,
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        uploadToSignedUrl: mockUploadToSignedUrl,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  },
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

// expo-image is a native module; the list only needs it to render something.
jest.mock("expo-image", () => {
  const { Image } = jest.requireActual("react-native");
  return { Image };
});

const AT = "2026-10-09T13:16:00+00:00";

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    title: "January timetable is up",
    body: "On the portal.",
    category: "news",
    image_path: null,
    author: { id: "u1", display_name: "Dr Popescu", avatar_url: null },
    published_at: AT,
    created_at: AT,
    updated_at: AT,
    can_edit: false,
    can_delete: false,
    ...overrides,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FeedScreen />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

async function fillComposer() {
  fireEvent.changeText(await screen.findByLabelText("Title"), "Photo day");
  fireEvent.changeText(screen.getByLabelText("Body"), "Smile.");
}

beforeEach(() => {
  mockGetMe.mockReset().mockResolvedValue(STUDENT_ME);
  mockListFeed.mockReset().mockResolvedValue([post()]);
  mockCreateFeedPost.mockReset();
  mockUpdateFeedPost.mockReset();
  mockDeleteFeedPost.mockReset();
  mockRequestFeedImageUploadUrl.mockReset();
  mockUploadToSignedUrl.mockReset();
  mockGetPublicUrl.mockReset().mockReturnValue({
    data: { publicUrl: "https://cdn.test/feed/x.jpg" },
  });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockReset();
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReset();
  (WebBrowser.openBrowserAsync as jest.Mock).mockReset();
});

test("shows a post with its title, byline and category", async () => {
  renderScreen();

  expect(await screen.findByText("January timetable is up")).toBeTruthy();
  expect(screen.getByText("Dr Popescu")).toBeTruthy();
  expect(screen.getByText("News")).toBeTruthy();
});

test("a learner gets no composer and no actions", async () => {
  renderScreen();

  await screen.findByText("January timetable is up");
  expect(screen.queryByText("New announcement")).toBeNull();
  expect(screen.queryByText("Edit")).toBeNull();
  expect(screen.queryByText("Delete")).toBeNull();
});

test("falls back to a generic byline when the author's profile is gone", async () => {
  // author_id is SET NULL, so the announcement outlives its author.
  mockListFeed.mockResolvedValue([post({ author: null })]);
  renderScreen();

  expect(await screen.findByText("Staff")).toBeTruthy();
});

test("opens a pasted https URL in the in-app browser", async () => {
  mockListFeed.mockResolvedValue([post({ body: "Watch at https://example.edu/live now." })]);
  renderScreen();

  fireEvent.press(await screen.findByText("https://example.edu/live"));

  // openBrowserAsync rather than Linking.openURL, so an unexpected target
  // cannot hand off to another app.
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://example.edu/live");
});

test("does not linkify a javascript: scheme", async () => {
  // Asserted on the link role rather than by pressing the text: a plain
  // body <Text> has no onPress, so a press-based assertion would pass even
  // with a matcher wide enough to linkify this.
  mockListFeed.mockResolvedValue([post({ body: "javascript:alert(1)" })]);
  renderScreen();

  await screen.findByText("January timetable is up");
  expect(screen.queryByRole("link")).toBeNull();
});

test("linkifies only the https run, so the surrounding text stays inert", async () => {
  mockListFeed.mockResolvedValue([post({ body: "mailto:a@b.com and https://example.edu/live" })]);
  renderScreen();

  await screen.findByText("January timetable is up");
  const links = screen.queryAllByRole("link");
  expect(links).toHaveLength(1);
  fireEvent.press(links[0]!);
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://example.edu/live");
});

test("shows the empty state when there are no posts", async () => {
  mockListFeed.mockResolvedValue([]);
  renderScreen();

  expect(await screen.findByText("No announcements yet.")).toBeTruthy();
});

test("surfaces a load failure", async () => {
  mockListFeed.mockRejectedValue(new Error("boom"));
  renderScreen();

  expect(await screen.findByText("Failed to load the feed: boom")).toBeTruthy();
});

test("an admin posts without an image", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockCreateFeedPost.mockResolvedValue(post());
  renderScreen();

  await fillComposer();
  fireEvent.press(screen.getByText("Post"));

  await waitFor(() =>
    expect(mockCreateFeedPost).toHaveBeenCalledWith({
      title: "Photo day",
      body: "Smile.",
      category: "news",
      image_path: null,
    }),
  );
  expect(mockRequestFeedImageUploadUrl).not.toHaveBeenCalled();
});

test("an admin posts a picture through upload-url then uploadToSignedUrl", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///p.jpg", mimeType: "image/jpeg", fileSize: 2048 }],
  });
  mockRequestFeedImageUploadUrl.mockResolvedValue({
    storage_path: "feed/3f2a1b0c-0000-4000-8000-000000000000.jpg",
    token: "signed",
  });
  mockUploadToSignedUrl.mockResolvedValue({ error: null });
  mockCreateFeedPost.mockResolvedValue(post());
  // The picker returns a uri, never bytes, so every upload fetches it first.
  global.fetch = jest.fn().mockResolvedValue({ blob: async () => ({ size: 2048 }) }) as never;

  renderScreen();
  await fillComposer();
  fireEvent.press(screen.getByText("Add a picture"));
  await waitFor(() => expect(screen.getByText("Change picture")).toBeTruthy());
  fireEvent.press(screen.getByText("Post"));

  await waitFor(() => expect(mockCreateFeedPost).toHaveBeenCalled());
  // The post carries the key the server minted, not a client-made path.
  expect(mockCreateFeedPost).toHaveBeenCalledWith(
    expect.objectContaining({ image_path: "feed/3f2a1b0c-0000-4000-8000-000000000000.jpg" }),
  );
});

test("a denied photo permission shows an error instead of hanging", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "denied",
  });
  renderScreen();

  fireEvent.press(await screen.findByText("Add a picture"));

  expect(
    await screen.findByText("Photo library permission is required to attach a picture."),
  ).toBeTruthy();
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
});

test("a failed upload shows an error and never creates the post", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///p.jpg", mimeType: "image/jpeg", fileSize: 10 }],
  });
  mockRequestFeedImageUploadUrl.mockResolvedValue({ storage_path: "feed/x.jpg", token: "t" });
  mockUploadToSignedUrl.mockResolvedValue({ error: new Error("upload exploded") });
  global.fetch = jest.fn().mockResolvedValue({ blob: async () => ({ size: 10 }) }) as never;

  renderScreen();
  await fillComposer();
  fireEvent.press(screen.getByText("Add a picture"));
  await waitFor(() => expect(screen.getByText("Change picture")).toBeTruthy());
  fireEvent.press(screen.getByText("Post"));

  expect(await screen.findByText("upload exploded")).toBeTruthy();
  expect(mockCreateFeedPost).not.toHaveBeenCalled();
});

test("an admin edits a post it did not author", async () => {
  // The distinctive rule: can_edit is role-based, so an admin sees Edit on
  // another admin's post.
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListFeed.mockResolvedValue([
    post({
      author: { id: "someone-else", display_name: "Dr Ionescu", avatar_url: null },
      can_edit: true,
      can_delete: true,
    }),
  ]);
  mockUpdateFeedPost.mockResolvedValue(post());
  renderScreen();

  fireEvent.press(await screen.findByText("Edit"));
  fireEvent.changeText(screen.getByLabelText("Edit title"), "Corrected title");
  fireEvent.press(screen.getByText("Save"));

  await waitFor(() =>
    expect(mockUpdateFeedPost).toHaveBeenCalledWith("p1", {
      title: "Corrected title",
      body: "On the portal.",
    }),
  );
});

test("an admin deletes a post after confirming", async () => {
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListFeed.mockResolvedValue([post({ can_edit: true, can_delete: true })]);
  mockDeleteFeedPost.mockResolvedValue(undefined);
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((button) => button.text === "Delete")?.onPress?.();
  });
  renderScreen();

  fireEvent.press(await screen.findByText("Delete"));

  await waitFor(() => expect(mockDeleteFeedPost).toHaveBeenCalledWith("p1"));
  alertSpy.mockRestore();
});

test("hides Edit when the server says the caller may not edit", async () => {
  // Proves the buttons read the server's flags rather than re-deriving them
  // from the caller's role -- the bug ad08d02 fixed on flashcards.
  mockGetMe.mockResolvedValue(ADMIN_ME);
  mockListFeed.mockResolvedValue([post({ can_edit: false, can_delete: false })]);
  renderScreen();

  await screen.findByText("January timetable is up");
  expect(screen.queryByText("Edit")).toBeNull();
  expect(screen.queryByText("Delete")).toBeNull();
});
