import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, type Mock } from "vitest";

import { ToastProvider } from "@/components/toast";

import type { LessonTool, LessonViewMode } from "./lesson-tools";
import { ToolNotch } from "./tool-notch";

function renderNotch(
  tool: LessonTool,
  {
    onPenSize = vi.fn(),
    onTool = vi.fn(),
    onMargins = vi.fn(),
    viewMode = "pdf",
    isAdmin = false,
    margins = false,
  }: {
    onPenSize?: Mock;
    onTool?: Mock;
    onMargins?: Mock;
    viewMode?: LessonViewMode;
    isAdmin?: boolean;
    margins?: boolean;
  } = {},
) {
  render(
    <ToastProvider>
      <ToolNotch
        tool={tool}
        viewMode={viewMode}
        onLessonTab
        canUndo={false}
        tocOpen={false}
        onToggleToc={vi.fn()}
        onSwatch={vi.fn()}
        onPenSize={onPenSize}
        onTool={onTool}
        onUndo={vi.fn()}
        textScaleAvailable={false}
        textScale={100}
        onTextScale={vi.fn()}
        isAdmin={isAdmin}
        margins={margins}
        onMargins={onMargins}
      />
    </ToastProvider>,
  );
  return { onPenSize, onTool, onMargins };
}

describe("ToolNotch pen sizes", () => {
  test("are offered only while the pen is in hand", () => {
    renderNotch({ kind: "highlight", color: 0 });
    expect(screen.queryByRole("group", { name: "Pen size" })).not.toBeInTheDocument();
  });

  test("show the pen's size as pressed, and pick another", async () => {
    const { onPenSize } = renderNotch({ kind: "pen", color: 1, size: "medium" });

    expect(screen.getByRole("button", { name: "Pen size — medium" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pen size — thin" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Pen size — thick" }));
    expect(onPenSize).toHaveBeenCalledWith("thick");
  });
});

describe("ToolNotch review words", () => {
  test("are offered to an admin only", () => {
    renderNotch(null, { viewMode: "text" });
    expect(screen.queryByRole("button", { name: "Review words" })).not.toBeInTheDocument();

    screen.getByRole("toolbar").remove();
    renderNotch(null, { viewMode: "text", isAdmin: true });
    expect(screen.getByRole("button", { name: "Review words" })).toBeInTheDocument();
  });

  test("say they belong to Text mode rather than marking a PDF page", async () => {
    const { onTool } = renderNotch(null, { viewMode: "pdf", isAdmin: true });
    const button = screen.getByRole("button", { name: "Review words" });
    expect(button).toHaveAttribute("aria-disabled", "true");

    await userEvent.setup().click(button);
    expect(onTool).not.toHaveBeenCalled();
    expect(await screen.findByText("Review words are marked in Text mode.")).toBeInTheDocument();
  });
});

describe("ToolNotch writing margins", () => {
  test("are offered on a PDF page only, and report their state", async () => {
    const { onMargins } = renderNotch(null, { margins: true });
    const button = screen.getByRole("button", { name: "Margins to write in" });
    expect(button).toHaveAttribute("aria-pressed", "true");

    await userEvent.setup().click(button);
    expect(onMargins).toHaveBeenCalled();
  });

  test("are not offered in Text mode, where there are no pages", () => {
    renderNotch(null, { viewMode: "text" });
    expect(screen.queryByRole("button", { name: "Margins to write in" })).not.toBeInTheDocument();
  });
});
