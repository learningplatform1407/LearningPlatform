import { renderHook } from "@testing-library/react-native";

import { useTabSwipe } from "./use-tab-swipe";

function swipe(
  handlers: ReturnType<typeof useTabSwipe>,
  dx: number,
  dy: number,
  { ms = 100, fingers = 1 } = {},
) {
  const touches = Array.from({ length: fingers }, () => ({}));
  handlers.onTouchStart({
    nativeEvent: { touches, pageX: 200, pageY: 300, timestamp: 1000 },
  } as never);
  handlers.onTouchEnd({
    nativeEvent: { touches: [], pageX: 200 + dx, pageY: 300 + dy, timestamp: 1000 + ms },
  } as never);
}

test("a quick sideways swipe moves one tab: left is next, right is previous", () => {
  const onSwipe = jest.fn();
  const { result } = renderHook(() => useTabSwipe(true, onSwipe));
  swipe(result.current, -120, 10);
  swipe(result.current, 120, -10);
  expect(onSwipe.mock.calls).toEqual([[1], [-1]]);
});

test("too short, too slow, too diagonal, two fingers, or disabled: nothing", () => {
  const onSwipe = jest.fn();
  const { result, rerender } = renderHook(({ on }) => useTabSwipe(on, onSwipe), {
    initialProps: { on: true },
  });
  swipe(result.current, -80, 0);
  swipe(result.current, -150, 0, { ms: 800 });
  swipe(result.current, -150, 80);
  swipe(result.current, -150, 0, { fingers: 2 });
  rerender({ on: false });
  swipe(result.current, -150, 0);
  expect(onSwipe).not.toHaveBeenCalled();
});
