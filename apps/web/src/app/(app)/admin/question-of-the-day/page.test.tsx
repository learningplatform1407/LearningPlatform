import type { DailyQuestionAdmin } from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import DailyQuestionAdminPage from "./page";

const getMe = vi.fn();
const getDailyQuestionAdmin = vi.fn();
const setDailyQuestion = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, getDailyQuestionAdmin, setDailyQuestion }),
}));

// A Tuesday, and never the real clock — the page builds its window from
// server_today, so the suite stays green on any day.
const TODAY = "2026-10-13";

function schedule(days: DailyQuestionAdmin["days"] = []): DailyQuestionAdmin {
  return { server_today: TODAY, days };
}

function drawn(
  forDate: string,
  overrides: Partial<DailyQuestionAdmin["days"][number]> = {},
): DailyQuestionAdmin["days"][number] {
  return {
    for_date: forDate,
    question: {
      id: "q1",
      prompt: "Which of these are prime?",
      kind: "multi",
      difficulty: "easy",
      points_possible: 2,
      options: [
        { id: "o1", text: "2" },
        { id: "o2", text: "4" },
      ],
    },
    overridden: false,
    answer_count: 0,
    can_change: true,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DailyQuestionAdminPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMe.mockReset().mockResolvedValue({ id: "u1", email: "a@b.c", role: "admin" });
  getDailyQuestionAdmin.mockReset().mockResolvedValue(schedule());
  setDailyQuestion.mockReset();
});

describe("DailyQuestionAdminPage", () => {
  test("refuses a learner, and does not even ask for the schedule", async () => {
    getMe.mockResolvedValue({ id: "u1", email: "a@b.c", role: "student" });

    renderPage();

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draw/ })).not.toBeInTheDocument();
    // The real gate is require_admin on the router; not firing the request at
    // all just avoids a pointless 403.
    expect(getDailyQuestionAdmin).not.toHaveBeenCalled();
  });

  test("lists today and the next fortnight, including days with no row yet", async () => {
    renderPage();

    // 15 rows: today plus 14. The API returns only materialised days — here,
    // none — so every row is rebuilt from server_today.
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(15);
    expect(screen.getByText("Today — Tuesday, October 13, 2026")).toBeInTheDocument();
    expect(screen.getByText("Tuesday, October 27, 2026")).toBeInTheDocument();
    expect(screen.getAllByText("No question picked yet.")).toHaveLength(15);
    // Past days are absent: changing one would rewrite answered history.
    expect(screen.queryByText(/October 12, 2026/)).not.toBeInTheDocument();
  });

  test("crosses a month boundary without skipping or repeating a day", async () => {
    // This is also the test that pins "the window comes from server_today, not
    // the device clock". The other cases use a TODAY that may coincide with
    // the real date, so a device-clock bug could pass them by luck; this date
    // is chosen not to.
    getDailyQuestionAdmin.mockResolvedValue({ server_today: "2026-10-25", days: [] });

    renderPage();

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(15);
    expect(screen.getByText("Today — Sunday, October 25, 2026")).toBeInTheDocument();
    expect(screen.getByText("Saturday, October 31, 2026")).toBeInTheDocument();
    expect(screen.getByText("Sunday, November 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("Sunday, November 8, 2026")).toBeInTheDocument();
  });

  test("shows a drawn day's question and whether an admin chose it", async () => {
    getDailyQuestionAdmin.mockResolvedValue(
      schedule([drawn(TODAY), drawn("2026-10-14", { overridden: true })]),
    );

    renderPage();

    expect(await screen.findByText("Drawn at random")).toBeInTheDocument();
    expect(screen.getByText("Chosen by an admin")).toBeInTheDocument();
    expect(screen.getAllByText("Which of these are prime?")).toHaveLength(2);
  });

  test("redraws a day without sending a question id", async () => {
    getDailyQuestionAdmin.mockResolvedValue(schedule([drawn(TODAY)]));
    setDailyQuestion.mockResolvedValue(drawn(TODAY, { overridden: true }));
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Draw a different question" }));

    // null is the redraw: the server picks, excluding the current question.
    await waitFor(() => expect(setDailyQuestion).toHaveBeenCalledWith(TODAY, null));
  });

  test("sets a specific question by id, on the day whose field was used", async () => {
    getDailyQuestionAdmin.mockResolvedValue(schedule());
    setDailyQuestion.mockResolvedValue(drawn("2026-10-15", { overridden: true }));
    const user = userEvent.setup();

    renderPage();
    const field = await screen.findByLabelText("Question id for Thursday, October 15, 2026");
    await user.type(field, "  q42  ");
    // Every row has its own Set button, so this has to be the right one.
    await user.click(screen.getAllByRole("button", { name: "Set" })[2]!);

    await waitFor(() => expect(setDailyQuestion).toHaveBeenCalledWith("2026-10-15", "q42"));
  });

  test("offers no controls for a day someone has already answered", async () => {
    getDailyQuestionAdmin.mockResolvedValue(
      schedule([drawn(TODAY, { answer_count: 3, can_change: false })]),
    );

    renderPage();

    expect(await screen.findByText(/3 people have already answered this day/)).toBeInTheDocument();
    expect(screen.getByText(/· 3 answers/)).toBeInTheDocument();
    // Today's row is the locked one, so its controls are gone while the other
    // fourteen keep theirs.
    expect(screen.getAllByRole("button", { name: "Draw a question" })).toHaveLength(14);
    expect(
      screen.queryByRole("button", { name: "Draw a different question" }),
    ).not.toBeInTheDocument();
  });

  test("surfaces the server's refusal rather than a generic failure", async () => {
    getDailyQuestionAdmin.mockResolvedValue(schedule([drawn(TODAY)]));
    setDailyQuestion.mockRejectedValue(
      new ApiClientError(409, { code: "day_closed", message: "A past day cannot be changed" }),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Draw a different question" }));

    // The server's own wording: a 409 here means something specific, and
    // "Something went wrong" would hide which rule was hit.
    expect(await screen.findByRole("alert")).toHaveTextContent("A past day cannot be changed");
  });

  test("reports a schedule it could not load", async () => {
    getDailyQuestionAdmin.mockRejectedValue(new Error("nope"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load the schedule.");
  });
});
