import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ToastProvider } from "@/components/toast";

import type { LessonTool } from "./lesson-tools";
import { ToolNotch } from "./tool-notch";

function renderNotch(tool: LessonTool, onPenSize = vi.fn()) {
  render(
    <ToastProvider>
      <ToolNotch
        tool={tool}
        viewMode="pdf"
        onLessonTab
        canUndo={false}
        tocOpen={false}
        onToggleToc={vi.fn()}
        onSwatch={vi.fn()}
        onPenSize={onPenSize}
        onTool={vi.fn()}
        onUndo={vi.fn()}
        textScaleAvailable={false}
        textScale={100}
        onTextScale={vi.fn()}
      />
    </ToastProvider>,
  );
  return onPenSize;
}

describe("ToolNotch pen sizes", () => {
  test("are offered only while the pen is in hand", () => {
    renderNotch({ kind: "highlight", color: 0 });
    expect(screen.queryByRole("group", { name: "Pen size" })).not.toBeInTheDocument();
  });

  test("show the pen's size as pressed, and pick another", async () => {
    const onPenSize = renderNotch({ kind: "pen", color: 1, size: "medium" });

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
