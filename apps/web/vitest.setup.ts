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
if (typeof globalThis.PointerEvent === "undefined" && typeof globalThis.MouseEvent !== "undefined") {
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
