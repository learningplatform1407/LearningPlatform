import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientError } from "@lp/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

function pasteJson(textarea: HTMLElement, json: string) {
  fireEvent.change(textarea, { target: { value: json } });
}

import ManageQuestionsPage from "./page";

const getMe = vi.fn();
const importQuestions = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({
    getMe,
    importQuestions,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ManageQuestionsPage />
    </QueryClientProvider>,
  );
}

const STUDENT_ME = { id: "u1", role: "student" };
const ADMIN_ME = { id: "u1", role: "admin" };

const VALID_JSON = JSON.stringify({
  allow_new_tags: false,
  questions: [
    {
      prompt: "Which drug class lowers preload?",
      kind: "single",
      scoring_scheme: "single_4",
      options: [
        { id: "a", text: "Nitrates" },
        { id: "b", text: "Vasopressors" },
      ],
      correct_option_ids: ["a"],
    },
  ],
});

beforeEach(() => {
  getMe.mockReset();
  importQuestions.mockReset();
});

test("shows Admin access required for a non-admin", async () => {
  getMe.mockResolvedValue(STUDENT_ME);

  renderPage();

  expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
  expect(screen.queryByText("Preview (dry run)")).not.toBeInTheDocument();
});

test("an admin can run a dry-run preview and see the result", async () => {
  getMe.mockResolvedValue(ADMIN_ME);
  importQuestions.mockResolvedValue({ created: 1, updated: 0, skipped: 0, errors: [] });

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON);
  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

  await waitFor(() => expect(importQuestions).toHaveBeenCalledWith(JSON.parse(VALID_JSON), true));
  expect(await screen.findByText("Dry run — nothing written yet")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
});

test("Import is disabled until a matching preview has run", async () => {
  getMe.mockResolvedValue(ADMIN_ME);
  importQuestions.mockResolvedValue({ created: 1, updated: 0, skipped: 0, errors: [] });

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  const importButton = screen.getByRole("button", { name: "Import" });
  expect(importButton).toBeDisabled();

  pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON);
  expect(importButton).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));
  await waitFor(() => expect(importButton).toBeEnabled());

  pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON + " ");
  expect(importButton).toBeDisabled();
});

test("an admin can commit after a successful preview", async () => {
  getMe.mockResolvedValue(ADMIN_ME);
  importQuestions
    .mockResolvedValueOnce({ created: 1, updated: 0, skipped: 0, errors: [] })
    .mockResolvedValueOnce({ created: 1, updated: 0, skipped: 0, errors: [] });

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON);
  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());

  await user.click(screen.getByRole("button", { name: "Import" }));

  await waitFor(() =>
    expect(importQuestions).toHaveBeenLastCalledWith(JSON.parse(VALID_JSON), false),
  );
  expect(await screen.findByText("Import committed")).toBeInTheDocument();
});

test("shows a parse error for invalid JSON instead of calling the API", async () => {
  getMe.mockResolvedValue(ADMIN_ME);

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  pasteJson(screen.getByLabelText("Import payload (JSON)"), "{not valid json");
  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

  expect(await screen.findByText(/Invalid JSON:/)).toBeInTheDocument();
  expect(importQuestions).not.toHaveBeenCalled();
});

test("shows the per-item validation errors from a dry run", async () => {
  getMe.mockResolvedValue(ADMIN_ME);
  importQuestions.mockResolvedValue({
    created: 1,
    updated: 0,
    skipped: 1,
    errors: [{ index: 1, field: "correct_option_ids", message: "must not be empty" }],
  });

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON);
  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

  expect(await screen.findByText("#1 · correct_option_ids: must not be empty")).toBeInTheDocument();
});

test("committing does not permanently disable Import for a later batch", async () => {
  getMe.mockResolvedValue(ADMIN_ME);
  importQuestions.mockResolvedValue({ created: 1, updated: 0, skipped: 0, errors: [] });

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON);
  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Import" }));
  await screen.findByText("Import committed");

  // A second, different batch: preview it and confirm Import re-enables
  // and the stale "Import committed" summary is replaced, rather than
  // Import staying disabled forever from the first commit's isSuccess.
  const secondBatch = JSON.stringify({ allow_new_tags: false, questions: [] });
  pasteJson(screen.getByLabelText("Import payload (JSON)"), secondBatch);
  expect(screen.queryByText("Import committed")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
  expect(await screen.findByText("Dry run — nothing written yet")).toBeInTheDocument();
});

test("a preview's result is attributed to the text submitted, not text typed afterward", async () => {
  getMe.mockResolvedValue(ADMIN_ME);
  let resolvePreview!: (value: {
    created: number;
    updated: number;
    skipped: number;
    errors: never[];
  }) => void;
  importQuestions.mockReturnValueOnce(
    new Promise((resolve) => {
      resolvePreview = resolve;
    }),
  );

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON);
  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

  // Edit the textarea while the preview request is still in flight.
  const editedBatch = JSON.stringify({ allow_new_tags: false, questions: [] });
  pasteJson(screen.getByLabelText("Import payload (JSON)"), editedBatch);

  resolvePreview({ created: 1, updated: 0, skipped: 0, errors: [] });
  await screen.findByText("Dry run — nothing written yet");

  // The edited (never-validated) text must not be treated as previewed.
  expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
});

test("rejects a payload that doesn't match the import schema, without calling the API", async () => {
  getMe.mockResolvedValue(ADMIN_ME);

  renderPage();
  const user = userEvent.setup();

  await screen.findByText("Preview (dry run)");
  pasteJson(
    screen.getByLabelText("Import payload (JSON)"),
    JSON.stringify({ allow_new_tags: false }),
  );
  await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

  expect(await screen.findByText(/Invalid JSON:/)).toBeInTheDocument();
  expect(importQuestions).not.toHaveBeenCalled();
});

describe("request errors", () => {
  test("shows the server's error message when the dry run request fails", async () => {
    getMe.mockResolvedValue(ADMIN_ME);
    importQuestions.mockRejectedValue(
      new ApiClientError(400, { code: "invalid_request", message: "Too many questions" }),
    );

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Preview (dry run)");
    pasteJson(screen.getByLabelText("Import payload (JSON)"), VALID_JSON);
    await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

    expect(await screen.findByText("Too many questions")).toBeInTheDocument();
  });
});
