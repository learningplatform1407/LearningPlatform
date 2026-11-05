import { readFileSync } from "node:fs";
import { join } from "node:path";

import { darkColors, fontSizes, lightColors, radii, spacing } from "@lp/ui";
import { describe, expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The body of the first rule whose selector is exactly `selector`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

function varIn(body: string, name: string): string | undefined {
  return body.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
}

function cssName(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** CSS writes `0.1`/`0.3` where the tokens write `0.10`/`0.30`; compare the
 * colours, not the spelling. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(\.\d*?)0+\)/g, "$1)")
    .replace(/\.\)/g, ")");
}

const lightBlock = block(":root");
const darkMediaBlock = block(`:root:not([data-theme="light"])`);
const darkForcedBlock = block(`:root[data-theme="dark"]`);

describe("globals.css mirrors packages/ui tokens", () => {
  test("light colours match", () => {
    for (const [key, value] of Object.entries(lightColors)) {
      expect(normalize(varIn(lightBlock, cssName(key)) ?? ""), key).toBe(normalize(value));
    }
  });

  test("dark colours match, in both the media-query and the forced block", () => {
    for (const [key, value] of Object.entries(darkColors)) {
      expect(normalize(varIn(darkMediaBlock, cssName(key)) ?? ""), key).toBe(normalize(value));
      expect(normalize(varIn(darkForcedBlock, cssName(key)) ?? ""), key).toBe(normalize(value));
    }
  });

  test("every colour token is exposed to Tailwind", () => {
    for (const key of Object.keys(lightColors)) {
      expect(css).toContain(`--color-${cssName(key)}: var(--${cssName(key)});`);
    }
  });

  test("spacing matches", () => {
    for (const [key, value] of Object.entries(spacing)) {
      expect(varIn(css, `spacing-${key}`)).toBe(`${value}px`);
    }
  });

  test("font sizes match", () => {
    for (const [key, value] of Object.entries(fontSizes)) {
      expect(varIn(css, `text-${key}`)).toBe(`${value}px`);
    }
  });

  test("radii match", () => {
    for (const [key, value] of Object.entries(radii)) {
      if (key === "full") continue; // Tailwind's own rounded-full
      expect(varIn(css, `radius-${key}`)).toBe(`${value}px`);
    }
  });
});
