import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import FeedPage from "./page";

// userEvent.upload() silently no-ops on file inputs in this project's jsdom
// setup, the same gap learn/library/[bookId]/page.test.tsx documents.
function selectFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

// jsdom implements neither of these; browsers do. The composer only uses
// createObjectURL for a local pre-upload preview, so a stub is enough.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

/** The composer and an open edit form both label a field "Title", so queries
 * for the edit form have to be scoped to the post's own <article>. */
function openPost() {
  return within(screen.getByRole("article"));
}

const getMe = vi.fn();
const listFeed = vi.fn();
const createFeedPost = vi.fn();
const updateFeedPost = vi.fn();
const deleteFeedPost = vi.fn();
const requestFeedImageUploadUrl = vi.fn();
const uploadToSignedUrl = vi.fn();
const getPublicUrl = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    listFeed,
    createFeedPost,
    updateFeedPost,
    deleteFeedPost,
    requestFeedImageUploadUrl,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl, getPublicUrl }) },
  }),
}));

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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <FeedPage />
      </QueryClientProvider>,
    ),
  };
}

describe("FeedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMe.mockResolvedValue({ id: "u1", email: "a@b.com", role: "student" });
    listFeed.mockResolvedValue([post()]);
    getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.test/feed/x.jpg" } });
  });

  test("shows a post with its title, byline and category", async () => {
    renderPage();

    expect(await screen.findByText("January timetable is up")).toBeInTheDocument();
    expect(screen.getByText("Dr Popescu")).toBeInTheDocument();
    expect(screen.getByText("News")).toBeInTheDocument();
  });

  test("a learner gets no composer and no actions", async () => {
    renderPage();

    await screen.findByText("January timetable is up");
    expect(screen.queryByText("New announcement")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("falls back to a generic byline when the author's profile is gone", async () => {
    // author_id is SET NULL, so the announcement outlives its author.
    listFeed.mockResolvedValue([post({ author: null })]);
    renderPage();

    expect(await screen.findByText("Staff")).toBeInTheDocument();
  });

  test("turns a pasted https URL in the body into a link", async () => {
    listFeed.mockResolvedValue([post({ body: "Watch at https://example.edu/live. Starts at 9." })]);
    renderPage();

    const link = await screen.findByRole("link", { name: "https://example.edu/live" });
    expect(link).toHaveAttribute("href", "https://example.edu/live");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // The trailing full stop stays as text rather than becoming part of the
    // href.
    expect(screen.getByText(/Starts at 9/)).toBeInTheDocument();
  });

  test("does not linkify a javascript: scheme", async () => {
    listFeed.mockResolvedValue([post({ body: "javascript:alert(1)" })]);
    renderPage();

    await screen.findByText("January timetable is up");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("shows the empty state when there are no posts", async () => {
    listFeed.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No announcements yet.")).toBeInTheDocument();
  });

  test("surfaces a load failure", async () => {
    listFeed.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load the feed: boom");
  });

  test("surfaces a failure to load the caller's own profile", async () => {
    // Without this branch an admin whose /v1/me call failed silently renders
    // the learner view -- no composer, no actions, no explanation.
    getMe.mockRejectedValue(new Error("me exploded"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to load your profile: me exploded",
    );
  });

  describe("as an admin", () => {
    beforeEach(() => {
      getMe.mockResolvedValue({ id: "u1", email: "a@b.com", role: "admin" });
    });

    test("Post stays disabled until both the title and the body are filled", async () => {
      renderPage();
      const user = userEvent.setup();

      const button = await screen.findByRole("button", { name: "Post" });
      expect(button).toBeDisabled();

      await user.type(screen.getByLabelText("Title"), "Exam dates");
      expect(button).toBeDisabled();

      await user.type(screen.getByLabelText("Body"), "See the portal.");
      expect(button).toBeEnabled();
    });

    test("posts without an image", async () => {
      createFeedPost.mockResolvedValue(post());
      renderPage();
      const user = userEvent.setup();

      await user.type(await screen.findByLabelText("Title"), "Exam dates");
      await user.type(screen.getByLabelText("Body"), "See the portal.");
      await user.click(screen.getByRole("button", { name: "Post" }));

      await waitFor(() =>
        expect(createFeedPost).toHaveBeenCalledWith({
          title: "Exam dates",
          body: "See the portal.",
          category: "news",
          image_path: null,
        }),
      );
      expect(requestFeedImageUploadUrl).not.toHaveBeenCalled();
    });

    test("walks upload-url, uploadToSignedUrl, then create -- in that order", async () => {
      requestFeedImageUploadUrl.mockResolvedValue({
        storage_path: "feed/3f2a1b0c-0000-4000-8000-000000000000.jpg",
        token: "signed",
      });
      uploadToSignedUrl.mockResolvedValue({ error: null });
      createFeedPost.mockResolvedValue(post());
      renderPage();
      const user = userEvent.setup();

      await user.type(await screen.findByLabelText("Title"), "Photo day");
      await user.type(screen.getByLabelText("Body"), "Smile.");
      selectFile(
        screen.getByLabelText("Picture (optional)"),
        new File(["x"], "p.jpg", { type: "image/jpeg" }),
      );
      await user.click(screen.getByRole("button", { name: "Post" }));

      await waitFor(() => expect(createFeedPost).toHaveBeenCalled());
      expect(requestFeedImageUploadUrl).toHaveBeenCalledWith({
        mime_type: "image/jpeg",
        size_bytes: 1,
      });
      // The post carries the key the server minted, not a client-made path.
      expect(createFeedPost).toHaveBeenCalledWith(
        expect.objectContaining({ image_path: "feed/3f2a1b0c-0000-4000-8000-000000000000.jpg" }),
      );
      expect(uploadToSignedUrl.mock.invocationCallOrder[0]!).toBeLessThan(
        createFeedPost.mock.invocationCallOrder[0]!,
      );
    });

    test("a failed upload shows an error and never creates the post", async () => {
      requestFeedImageUploadUrl.mockResolvedValue({ storage_path: "feed/x.jpg", token: "t" });
      uploadToSignedUrl.mockResolvedValue({ error: new Error("upload exploded") });
      renderPage();
      const user = userEvent.setup();

      await user.type(await screen.findByLabelText("Title"), "Photo day");
      await user.type(screen.getByLabelText("Body"), "Smile.");
      selectFile(
        screen.getByLabelText("Picture (optional)"),
        new File(["x"], "p.jpg", { type: "image/jpeg" }),
      );
      await user.click(screen.getByRole("button", { name: "Post" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("upload exploded");
      // The orphan is an object in the bucket, not a post with a broken
      // image: creating the row would be the worse outcome.
      expect(createFeedPost).not.toHaveBeenCalled();
    });

    test("rejects an oversize image before uploading anything", async () => {
      renderPage();
      await screen.findByLabelText("Picture (optional)");

      const huge = new File(["x"], "p.jpg", { type: "image/jpeg" });
      Object.defineProperty(huge, "size", { value: 6 * 1024 * 1024 });
      selectFile(screen.getByLabelText("Picture (optional)"), huge);

      expect(await screen.findByText("Image must be under 5MB.")).toBeInTheDocument();
      expect(requestFeedImageUploadUrl).not.toHaveBeenCalled();
    });

    test("edits a post it did not author", async () => {
      // The distinctive rule: can_edit is role-based, so an admin sees Edit on
      // another admin's post.
      listFeed.mockResolvedValue([
        post({
          author: { id: "someone-else", display_name: "Dr Ionescu", avatar_url: null },
          can_edit: true,
          can_delete: true,
        }),
      ]);
      updateFeedPost.mockResolvedValue(post());
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit" }));
      const titleField = openPost().getByLabelText("Title");
      await user.clear(titleField);
      await user.type(titleField, "Corrected title");
      await user.click(openPost().getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(updateFeedPost).toHaveBeenCalledWith("p1", {
          title: "Corrected title",
          body: "On the portal.",
        }),
      );
    });

    test("deletes a post after confirming", async () => {
      listFeed.mockResolvedValue([post({ can_edit: true, can_delete: true })]);
      deleteFeedPost.mockResolvedValue(undefined);
      vi.spyOn(window, "confirm").mockReturnValue(true);
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteFeedPost).toHaveBeenCalledWith("p1"));
    });

    test("does not delete when the confirmation is dismissed", async () => {
      listFeed.mockResolvedValue([post({ can_edit: true, can_delete: true })]);
      vi.spyOn(window, "confirm").mockReturnValue(false);
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Delete" }));

      expect(deleteFeedPost).not.toHaveBeenCalled();
    });

    test("Edit shows another admin's correction rather than the stale text", async () => {
      // The lost-update bug: the card seeds its form from props once. After a
      // refetch brings someone else's correction, opening Edit must not offer
      // the pre-correction text -- Saving that would quietly overwrite them.
      listFeed.mockResolvedValue([post({ can_edit: true, can_delete: true })]);
      updateFeedPost.mockResolvedValue(post());
      const { queryClient } = renderPage();
      const user = userEvent.setup();

      await screen.findByText("January timetable is up");

      listFeed.mockResolvedValue([
        post({ title: "Corrected by someone else", can_edit: true, can_delete: true }),
      ]);
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
      await screen.findByText("Corrected by someone else");

      await user.click(screen.getByRole("button", { name: "Edit" }));
      expect(openPost().getByLabelText("Title")).toHaveValue("Corrected by someone else");
    });

    test("a background refetch does not overwrite what is being typed", async () => {
      // The other half of the same trade-off: the resync is skipped while the
      // form is open, so a refetch cannot yank text out mid-sentence.
      listFeed.mockResolvedValue([post({ can_edit: true, can_delete: true })]);
      const { queryClient } = renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit" }));
      const titleField = openPost().getByLabelText("Title");
      await user.clear(titleField);
      await user.type(titleField, "Half-written thou");

      listFeed.mockResolvedValue([
        post({ title: "Something else entirely", can_edit: true, can_delete: true }),
      ]);
      await queryClient.invalidateQueries({ queryKey: ["feed"] });

      expect(openPost().getByLabelText("Title")).toHaveValue("Half-written thou");
    });

    test("removes a post's picture", async () => {
      // The server's clear branch had no caller at all before this: a post
      // published with the wrong photo could only be fixed by deleting it.
      listFeed.mockResolvedValue([
        post({ image_path: "feed/x.jpg", can_edit: true, can_delete: true }),
      ]);
      updateFeedPost.mockResolvedValue(post());
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit" }));
      await user.click(openPost().getByRole("button", { name: "Remove picture" }));
      expect(openPost().getByText(/picture will be removed/)).toBeInTheDocument();
      await user.click(openPost().getByRole("button", { name: "Save" }));

      await waitFor(() =>
        // Explicit null, not an omitted key -- that is how the server tells
        // "remove it" from "leave it alone".
        expect(updateFeedPost).toHaveBeenCalledWith("p1", {
          title: "January timetable is up",
          body: "On the portal.",
          image_path: null,
        }),
      );
    });

    test("replaces a post's picture", async () => {
      listFeed.mockResolvedValue([
        post({ image_path: "feed/old.jpg", can_edit: true, can_delete: true }),
      ]);
      requestFeedImageUploadUrl.mockResolvedValue({ storage_path: "feed/new.jpg", token: "t" });
      uploadToSignedUrl.mockResolvedValue({ error: null });
      updateFeedPost.mockResolvedValue(post());
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit" }));
      selectFile(
        openPost().getByLabelText("Replace the picture"),
        new File(["x"], "n.jpg", { type: "image/jpeg" }),
      );
      await user.click(openPost().getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(updateFeedPost).toHaveBeenCalledWith(
          "p1",
          expect.objectContaining({ image_path: "feed/new.jpg" }),
        ),
      );
    });

    test("editing only the text leaves the picture alone", async () => {
      listFeed.mockResolvedValue([
        post({ image_path: "feed/x.jpg", can_edit: true, can_delete: true }),
      ]);
      updateFeedPost.mockResolvedValue(post());
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit" }));
      const titleField = openPost().getByLabelText("Title");
      await user.clear(titleField);
      await user.type(titleField, "New title");
      await user.click(openPost().getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(updateFeedPost).toHaveBeenCalledWith("p1", {
          title: "New title",
          body: "On the portal.",
        }),
      );
    });

    test("a retry after a failed create reuses the uploaded image", async () => {
      // Otherwise every retry mints another object in a bucket with no sweeper.
      requestFeedImageUploadUrl.mockResolvedValue({ storage_path: "feed/once.jpg", token: "t" });
      uploadToSignedUrl.mockResolvedValue({ error: null });
      createFeedPost.mockRejectedValueOnce(new Error("server said no"));
      renderPage();
      const user = userEvent.setup();

      await user.type(await screen.findByLabelText("Title"), "Photo day");
      await user.type(screen.getByLabelText("Body"), "Smile.");
      selectFile(
        screen.getByLabelText("Picture (optional)"),
        new File(["x"], "p.jpg", { type: "image/jpeg" }),
      );

      await user.click(screen.getByRole("button", { name: "Post" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("server said no");

      createFeedPost.mockResolvedValue(post());
      await user.click(screen.getByRole("button", { name: "Post" }));

      await waitFor(() => expect(createFeedPost).toHaveBeenCalledTimes(2));
      expect(requestFeedImageUploadUrl).toHaveBeenCalledTimes(1);
      expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    });

    test("hides Edit when the server says the caller may not edit", async () => {
      // Proves the buttons read the server's flags rather than re-deriving
      // them from the caller's role -- the bug ad08d02 fixed on flashcards.
      listFeed.mockResolvedValue([post({ can_edit: false, can_delete: false })]);
      renderPage();

      await screen.findByText("January timetable is up");
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });

    test("surfaces a delete failure", async () => {
      listFeed.mockResolvedValue([post({ can_edit: true, can_delete: true })]);
      deleteFeedPost.mockRejectedValue(new Error("nope"));
      vi.spyOn(window, "confirm").mockReturnValue(true);
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Delete" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("nope");
    });
  });
});
