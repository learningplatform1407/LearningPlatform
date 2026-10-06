import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import ManageFlashcardsPage from "./page";

const getMe = vi.fn();
const importFlashcards = vi.fn();

vi.mock("@/lib/api-client.browser", () => ({
  getBrowserApiClient: () => ({ getMe, importFlashcards }),
}));

const PAYLOAD = JSON.stringify({
  flashcards: [
    {
      external_id: "fc-1",
      document_id: "2879a273-236d-429e-985b-db6c43672a1b",
      front_text: "Front",
      back_text: "Back",
    },
  ],
});

beforeEach(() => {
  getMe.mockReset().mockResolvedValue({ id: "u1", email: "a@b.c", role: "admin" });
  importFlashcards.mockReset().mockResolvedValue({
    created: 1,
    updated: 0,
    skipped: 0,
    errors: [],
  });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ManageFlashcardsPage />
    </QueryClientProvider>,
  );
}

describe("ManageFlashcardsPage", () => {
  test("refuses a learner without rendering the form", async () => {
    getMe.mockResolvedValue({ id: "u1", email: "a@b.c", role: "student" });

    renderPage();

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Import payload (JSON)")).not.toBeInTheDocument();
  });

  test("blocks Import until a dry run has been made on the current payload", async () => {
    renderPage();
    const user = userEvent.setup();

    const textarea = await screen.findByLabelText("Import payload (JSON)");
    await user.click(textarea);
    await user.paste(PAYLOAD);

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

    expect(importFlashcards).toHaveBeenCalledWith(expect.anything(), true);
    expect(await screen.findByText("Dry run — nothing written yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(importFlashcards).toHaveBeenLastCalledWith(expect.anything(), false);
    expect(await screen.findByText("Import committed")).toBeInTheDocument();
  });

  test("editing the payload after a preview re-blocks Import", async () => {
    renderPage();
    const user = userEvent.setup();

    const textarea = await screen.findByLabelText("Import payload (JSON)");
    await user.click(textarea);
    await user.paste(PAYLOAD);
    await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));
    await screen.findByText("Dry run — nothing written yet");

    // The preview applies to the exact text it ran on, so a later edit must
    // not inherit its approval.
    await user.type(textarea, " ");

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  test("reports invalid JSON rather than sending it", async () => {
    renderPage();
    const user = userEvent.setup();

    const textarea = await screen.findByLabelText("Import payload (JSON)");
    await user.click(textarea);
    await user.paste("{not json");
    await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid JSON");
    expect(importFlashcards).not.toHaveBeenCalled();
  });

  test("reports a payload the schema rejects", async () => {
    renderPage();
    const user = userEvent.setup();

    const textarea = await screen.findByLabelText("Import payload (JSON)");
    await user.click(textarea);
    // Missing back_text — caught client-side before a round-trip.
    await user.paste('{"flashcards": [{"external_id": "fc-1", "document_id": "d1"}]}');
    await user.click(screen.getByRole("button", { name: "Preview (dry run)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid JSON");
    expect(importFlashcards).not.toHaveBeenCalled();
  });
});
