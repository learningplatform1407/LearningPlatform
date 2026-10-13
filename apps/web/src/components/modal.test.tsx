import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Modal } from "./modal";

/** A realistic host: a trigger that opens the modal, so focus restoration has
 * somewhere to return to. */
function Harness({ onClose }: { onClose?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal
        open={open}
        title="Question of the day"
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <button type="button">Inside</button>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  test("renders nothing until opened", () => {
    render(<Harness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("is a labelled modal dialog once open", async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Question of the day");
  });

  test("closes on the X", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("closes on Escape", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("closes on a backdrop click but not on a click inside", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));

    // A click that bubbles out of the panel must not count as the backdrop.
    await user.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The wrapper is the dialog's parent; clicking it directly is the backdrop.
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalled();
  });

  test("locks body scroll while open and restores it after", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    expect(document.body.style.overflow).toBe("");

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  test("takes focus on open and returns it to the opener on close", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const opener = screen.getByRole("button", { name: "Open" });

    await user.click(opener);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Escape}");
    // Without this, a keyboard user is dumped at the top of the document with
    // no idea where they were.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  test("escapes the page's stacking context via a portal", async () => {
    // Rendered into document.body rather than next to the trigger, so no
    // ancestor's transform/filter/contain can re-anchor the fixed positioning.
    const { container } = render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(container).not.toContainElement(screen.getByRole("dialog"));
    expect(document.body).toContainElement(screen.getByRole("dialog"));
  });
});
