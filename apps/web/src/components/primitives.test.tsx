import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Dot } from "./dot";
import { NotchTabs } from "./notch-tabs";
import { SegmentedSwitch } from "./segmented-switch";
import { ToastProvider, useToast } from "./toast";

const TABS = [
  { key: "lesson", label: "Lesson" },
  { key: "review", label: "Review" },
] as const;

function TabsHarness() {
  const [active, setActive] = useState<"lesson" | "review">("lesson");
  return <NotchTabs tabs={TABS} active={active} onChange={setActive} label="Lesson sections" />;
}

describe("NotchTabs", () => {
  test("exposes a labelled tablist whose selection follows clicks", async () => {
    render(<TabsHarness />);
    const tablist = screen.getByRole("tablist", { name: "Lesson sections" });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lesson" })).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("tab", { name: "Review" }));

    expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Lesson" })).toHaveAttribute("aria-selected", "false");
  });
});

describe("SegmentedSwitch", () => {
  test("marks exactly the current option pressed and reports changes", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedSwitch
        label="Lesson view mode"
        value="pdf"
        onChange={onChange}
        options={[
          { value: "pdf", label: "PDF" },
          { value: "text", label: "Text" },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: "Lesson view mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(onChange).toHaveBeenCalledWith("text");
  });
});

describe("Dot", () => {
  test("is a named button carrying its toggle state", () => {
    render(
      <Dot aria-label="Theme" aria-pressed={true}>
        ☾
      </Dot>,
    );
    expect(screen.getByRole("button", { name: "Theme" })).toHaveAttribute("aria-pressed", "true");
  });
});

function ToastTrigger() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast("Saved")}>
      Save
    </button>
  );
}

describe("Toast", () => {
  test("announces a message politely and hides it again", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <ToastTrigger />
        </ToastProvider>,
      );
      act(() => screen.getByRole("button", { name: "Save" }).click());

      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("Saved");
      expect(status).toHaveClass("opacity-95");

      act(() => vi.advanceTimersByTime(1800));
      expect(status).toHaveClass("opacity-0");
    } finally {
      vi.useRealTimers();
    }
  });
});
