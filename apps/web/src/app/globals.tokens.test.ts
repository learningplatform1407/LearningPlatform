import { readFileSync } from "node:fs";
import { join } from "node:path";

import { colors, fontSizes, spacing } from "@lp/ui";
import { describe, expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function cssVarValue(name: string): string | undefined {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

describe("globals.css @theme mirrors packages/ui tokens", () => {
  test("colors match", () => {
    for (const [key, value] of Object.entries(colors)) {
      const cssKey = `color-${key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
      expect(cssVarValue(cssKey)).toBe(value.toLowerCase());
    }
  });

  test("spacing matches", () => {
    for (const [key, value] of Object.entries(spacing)) {
      expect(cssVarValue(`spacing-${key}`)).toBe(`${value}px`);
    }
  });

  test("font sizes match", () => {
    for (const [key, value] of Object.entries(fontSizes)) {
      expect(cssVarValue(`text-${key}`)).toBe(`${value}px`);
    }
  });
});
