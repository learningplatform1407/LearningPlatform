import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import LessonsPage from "./page";

const getMe = vi.fn();
const listChapters = vi.fn();
const listDocuments = vi.fn();
const createChapter = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, listChapters, listDocuments, createChapter }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LessonsPage />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

beforeEach(() => {
  getMe.mockReset();
  listChapters.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
  createChapter.mockReset();
});

describe("LessonsPage", () => {
  test("renders chapters with their lesson counts", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listChapters.mockResolvedValue([
      { id: "c1", title: "Intro to Systems", order_index: 0, lesson_count: 3 },
      { id: "c2", title: "Consistency", order_index: 1, lesson_count: 1 },
    ]);

    renderPage();

    expect(await screen.findByText("Intro to Systems")).toBeInTheDocument();
    expect(screen.getByText("3 lessons")).toBeInTheDocument();
    expect(screen.getByText("1 lesson")).toBeInTheDocument();
  });

  test("shows an Uncategorized entry only when chapterless lessons exist", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listChapters.mockResolvedValue([]);
    listDocuments.mockResolvedValue([
      { id: "d1", title: "Loose lesson", created_at: "2026-01-01", status: "ready" },
    ]);

    renderPage();

    expect(await screen.findByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Uncategorized/ })).toHaveAttribute(
      "href",
      "/learn/lessons/uncategorized",
    );
  });

  test("hides Uncategorized when there are no chapterless lessons", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listChapters.mockResolvedValue([
      { id: "c1", title: "Intro to Systems", order_index: 0, lesson_count: 1 },
    ]);
    listDocuments.mockResolvedValue([]);

    renderPage();

    await screen.findByText("Intro to Systems");
    expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
  });

  test("shows an empty state when there are no chapters and nothing uncategorized", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listChapters.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No chapters yet.")).toBeInTheDocument();
  });

  test("hides the new-chapter form for a non-admin", async () => {
    getMe.mockResolvedValue(STUDENT_ME);
    listChapters.mockResolvedValue([]);

    renderPage();

    await screen.findByText("No chapters yet.");
    expect(screen.queryByText("New chapter")).not.toBeInTheDocument();
  });

  test("an admin can create a new chapter", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    listChapters.mockResolvedValue([]);
    createChapter.mockResolvedValue({
      id: "c1",
      title: "New Chapter",
      order_index: 0,
      lesson_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("New chapter");
    await user.type(screen.getByLabelText("Title"), "New Chapter");
    fireEvent.submit(screen.getByLabelText("Title").closest("form")!);

    await waitFor(() => expect(createChapter).toHaveBeenCalledWith({ title: "New Chapter" }));
  });
});
