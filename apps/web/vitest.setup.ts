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
