import { describe, expect, test } from "vitest";

import { describeInterval, formatInterval } from "./interval";

describe("formatInterval", () => {
  test("days, then months, then years", () => {
    expect(formatInterval(1)).toBe("1d");
    expect(formatInterval(29)).toBe("29d");
    expect(formatInterval(30)).toBe("1mo");
    expect(formatInterval(100)).toBe("3mo");
    expect(formatInterval(365)).toBe("1y");
    expect(formatInterval(550)).toBe("1.5y");
    expect(formatInterval(36_500)).toBe("100y");
  });

  test("describeInterval pluralises", () => {
    expect(describeInterval(1)).toBe("1 day");
    expect(describeInterval(6)).toBe("6 days");
  });
});
