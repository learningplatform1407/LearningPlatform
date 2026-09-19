import { describe, expect, test } from "vitest";

import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, spacing } from "./index";

describe("design tokens", () => {
  test("colors has the expected semantic keys", () => {
    for (const key of [
      "background",
      "foreground",
      "muted",
      "mutedForeground",
      "border",
      "primary",
      "primaryForeground",
      "secondary",
      "secondaryForeground",
      "danger",
      "dangerForeground",
      "success",
      "warning",
    ] as const) {
      expect(colors[key]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  test("spacing is a monotonically increasing numeric scale", () => {
    const values = Object.values(spacing);
    const isIncreasing = values.every((value, index) => index === 0 || value > values[index - 1]!);
    expect(isIncreasing).toBe(true);
  });

  test("typography scales are present", () => {
    expect(Object.keys(fontSizes).length).toBeGreaterThan(0);
    expect(Object.keys(fontWeights).length).toBeGreaterThan(0);
    expect(Object.keys(lineHeights).length).toBeGreaterThan(0);
  });

  test("radii is a monotonically increasing numeric scale, aside from the full-pill outlier", () => {
    const { full, ...steps } = radii;
    const values = Object.values(steps);
    const isIncreasing = values.every((value, index) => index === 0 || value > values[index - 1]!);
    expect(isIncreasing).toBe(true);
    expect(full).toBeGreaterThan(Math.max(...values));
  });

  test("shadows has the RN-shape keys every level needs", () => {
    for (const shadow of Object.values(shadows)) {
      expect(shadow).toHaveProperty("shadowColor");
      expect(shadow).toHaveProperty("shadowOffset");
      expect(shadow).toHaveProperty("shadowOpacity");
      expect(shadow).toHaveProperty("shadowRadius");
      expect(shadow).toHaveProperty("elevation");
    }
  });
});
