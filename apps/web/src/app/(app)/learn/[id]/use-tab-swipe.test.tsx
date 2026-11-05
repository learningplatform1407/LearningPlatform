import { fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useTabSwipe } from "./use-tab-swipe";

function swipe(target: Window | Element, dx: number, dy: number, { ms = 100, fingers = 1 } = {}) {
  const now = vi.spyOn(Date, "now");
  now.mockReturnValue(1_000);
  const touches = Array.from({ length: fingers }, () => ({ clientX: 200, clientY: 300 }));
  fireEvent.touchStart(target, { touches });
  now.mockReturnValue(1_000 + ms);
  fireEvent.touchEnd(target, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
  now.mockRestore();
}

afterEach(() => vi.restoreAllMocks());

describe("useTabSwipe", () => {
  test("a quick sideways swipe moves one tab, left is next and right is previous", () => {
    const onSwipe = vi.fn();
    renderHook(() => useTabSwipe(true, onSwipe));
    swipe(window, -120, 10);
    swipe(window, 120, -10);
    expect(onSwipe.mock.calls).toEqual([[1], [-1]]);
  });

  test("too short, too slow, too diagonal or two fingers does nothing", () => {
    const onSwipe = vi.fn();
    renderHook(() => useTabSwipe(true, onSwipe));
    swipe(window, -80, 0);
    swipe(window, -150, 0, { ms: 800 });
    swipe(window, -150, 80);
    swipe(window, -150, 0, { fingers: 2 });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  test("ignored when disabled or when it starts in a no-swipe zone", () => {
    const onSwipe = vi.fn();
    const { rerender } = renderHook(({ on }) => useTabSwipe(on, onSwipe), {
      initialProps: { on: false },
    });
    swipe(window, -150, 0);
    rerender({ on: true });
    const { getByText } = render(<div data-no-swipe>panel</div>);
    swipe(getByText("panel"), -150, 0);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
