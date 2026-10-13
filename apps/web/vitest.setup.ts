import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's automatic cleanup-between-tests relies on detecting a global test
// framework's afterEach; this project imports afterEach/etc. explicitly per
// file rather than enabling vitest's `globals` option, so that detection
// never fires without this — every test file up to now had exactly one
// `test()`, so a leftover un-unmounted DOM tree between tests never showed up.
afterEach(() => {
  cleanup();
});

// Node 26 ships its own `localStorage` global, which is unavailable unless
// --localstorage-file is passed, and it shadows the perfectly good one jsdom
// provides — so `window.localStorage` reads back `undefined` on a dev machine
// while being a real Storage under CI's pinned Node 22. The question-of-the-day
// dismissal marker lives in localStorage, so without this the same test is red
// locally and green in CI. A minimal in-memory Storage makes both agree.
// `typeof window` guard, not just a truthiness check: checksum.test.ts opts
// into the node environment, where there is no window at all.
if (typeof window !== "undefined" && typeof window.localStorage?.getItem !== "function") {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, String(value)),
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

// jsdom doesn't implement ResizeObserver — DrawingCanvas (notebook drawings)
// uses it to size the canvas to its container. A no-op stub is enough since
// tests assert on stroke data, not on-screen pixel layout.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom also doesn't implement PointerEvent, so fireEvent.pointerDown/move/up
// fall back to a plain Event with no clientX/clientY/pressure — DrawingCanvas
// reads all three to build stroke points. A minimal MouseEvent-based subclass
// is enough for tests to simulate a real pointer drag.
if (
  typeof globalThis.PointerEvent === "undefined" &&
  typeof globalThis.MouseEvent !== "undefined"
) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pressure: number;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pressure = params.pressure ?? 0;
    }
  }
  // @ts-expect-error -- polyfilling a constructor jsdom doesn't provide
  globalThis.PointerEvent = PointerEventPolyfill;
}
