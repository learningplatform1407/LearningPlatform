import { describe, expect, test } from "vitest";

import {
  colors,
  darkColors,
  figtreeFamily,
  fontSizes,
  fontWeights,
  highlightIndex,
  lightColors,
  lineHeights,
  pageColors,
  radii,
  shadows,
  spacing,
} from "./index";

const COLOR_VALUE = /^(#[0-9A-F]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\))$/i;

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
      "accent",
      "paper",
      "danger",
      "dangerForeground",
      "success",
      "warning",
      "again",
      "hard",
      "good",
      "easy",
    ] as const) {
      expect(colors[key]).toMatch(COLOR_VALUE);
    }
  });

  test("the dark palette defines exactly the light palette's keys, all valid colours", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
    for (const value of [...Object.values(lightColors), ...Object.values(darkColors)]) {
      expect(value).toMatch(COLOR_VALUE);
    }
  });

  test("`colors` is the light palette, for consumers that aren't theme-aware yet", () => {
    expect(colors).toBe(lightColors);
  });

  test("paper stays light in both themes", () => {
    // Cloze cards and grade buttons are "paper on a dark desk" -- their dark
    // text would vanish if paper followed the theme.
    expect(darkColors.paperForeground).toBe(lightColors.paperForeground);
  });

  test("page swatches and pens line up with the five highlight fills", () => {
    expect(pageColors.swatches).toHaveLength(5);
    expect(pageColors.pens).toHaveLength(5);
    expect(lightColors).toHaveProperty("highlight4");
  });

  test("highlightIndex maps stored names, including legacy pink, onto the five fills", () => {
    expect(highlightIndex("yellow")).toBe(0);
    expect(highlightIndex("green")).toBe(4);
    expect(highlightIndex("pink")).toBe(highlightIndex("red"));
    expect(highlightIndex(null)).toBe(0);
    expect(highlightIndex("not-a-colour")).toBe(0);
  });

  test("every weight has a Figtree family for mobile", () => {
    for (const weight of Object.values(fontWeights)) {
      expect(figtreeFamily[weight]).toMatch(/^Figtree_/);
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
