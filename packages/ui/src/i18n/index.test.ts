import { describe, expect, test } from "vitest";

import { en } from "./messages/en";
import { ro } from "./messages/ro";

import { buildMonthGrid, formatCalendarDate, weekdayLabels } from "../calendar";
import { describeInterval, formatInterval, formatMonthYear, formatPostDate } from "../format";

import {
  authErrorMessage,
  getTranslator,
  LANGUAGES,
  LOCALE_TAGS,
  resolveLanguage,
  selectPluralForm,
} from ".";

/** Every leaf path of a catalogue, plural forms collapsed to their key. */
function paths(node: object, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string" || "other" in value
      ? [`${prefix}${key}`]
      : paths(value as object, `${prefix}${key}.`),
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

function leaf(catalogue: object, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalogue);
}

describe("catalogues", () => {
  test("Romanian has exactly the English keys", () => {
    expect(paths(ro)).toEqual(paths(en));
  });

  test("every translation uses the English placeholders", () => {
    // Across a plural's forms: a "one" form may leave out {count} ("Someone
    // has..."), but between them the forms must name the same values.
    const all = (value: unknown) => {
      const forms =
        typeof value === "string" ? [value] : Object.values(value as object).map(String);
      return [...new Set(forms.flatMap(placeholders))].sort();
    };
    for (const path of paths(en)) {
      expect({ path, placeholders: all(leaf(ro, path)) }).toEqual({
        path,
        placeholders: all(leaf(en, path)),
      });
    }
  });

  test("no translation is left empty", () => {
    for (const path of paths(ro)) {
      const value = leaf(ro, path);
      const forms = typeof value === "string" ? [value] : Object.values(value as object);
      for (const form of forms)
        expect({ path, empty: String(form).trim() === "" }).toEqual({ path, empty: false });
    }
  });
});

describe("resolveLanguage", () => {
  test("accepts codes, locale tags and Accept-Language headers", () => {
    expect(resolveLanguage("ro")).toBe("ro");
    expect(resolveLanguage("ro-RO")).toBe("ro");
    expect(resolveLanguage("fr-FR,ro;q=0.9,en;q=0.8")).toBe("ro");
    expect(resolveLanguage("de-DE,de;q=0.9")).toBe("en");
    expect(resolveLanguage(undefined)).toBe("en");
  });
});

describe("selectPluralForm", () => {
  // The rules are written out in plural.ts because Hermes (React Native) has
  // no Intl.PluralRules; Node's ICU does, so it can referee them here.
  test("agrees with Intl.PluralRules on every count a message can show", () => {
    for (const language of LANGUAGES) {
      const rules = new Intl.PluralRules(LOCALE_TAGS[language]);
      const counts = [...Array(1201).keys(), 0.5, 1.0, 1.5, 2.5, 20.5, -1, -3, -20];
      const ours = counts.map((count) => `${count}=${selectPluralForm(language, count)}`);
      const icu = counts.map((count) => `${count}=${rules.select(count)}`);
      expect({ language, forms: ours }).toEqual({ language, forms: icu });
    }
  });

  test("Romanian's three forms at their boundaries", () => {
    const ro = (count: number) => selectPluralForm("ro", count);
    expect([ro(0), ro(1), ro(2), ro(19)]).toEqual(["few", "one", "few", "few"]);
    // 20–100 take "de", then 101–119 are few again ("101 lecții").
    expect([ro(20), ro(100), ro(101), ro(119), ro(120)]).toEqual([
      "other",
      "other",
      "few",
      "few",
      "other",
    ]);
  });
});

describe("translator", () => {
  test("Romanian plurals: one, few (2–19), and the 'de' form from 20", () => {
    const { t } = getTranslator("ro");
    expect(t("library.lessons", { count: 1 })).toBe("1 lecție");
    expect(t("library.lessons", { count: 3 })).toBe("3 lecții");
    expect(t("library.lessons", { count: 20 })).toBe("20 de lecții");
    expect(t("library.lessons", { count: 101 })).toBe("101 lecții");
  });

  test("English plurals and number formatting", () => {
    const { t } = getTranslator("en");
    expect(t("library.lessons", { count: 1 })).toBe("1 lesson");
    expect(t("library.lessons", { count: 1200 })).toBe("1,200 lessons");
  });

  test("looks up a key and fills placeholders", () => {
    expect(getTranslator("en").t("common.failedToSave", { message: "boom" })).toBe(
      "Failed to save: boom",
    );
    expect(getTranslator("ro").t("common.save")).toBe("Salvează");
  });

  test("an unknown key falls back to the key itself", () => {
    // @ts-expect-error -- deliberately not a key
    expect(getTranslator("ro").t("nope.missing")).toBe("nope.missing");
  });

  test("auth errors: known codes are translated, the rest keep Supabase's text", () => {
    const ro = getTranslator("ro");
    expect(
      authErrorMessage(ro, { code: "invalid_credentials", message: "Invalid login credentials" }),
    ).toBe("Email sau parolă greșită.");
    expect(authErrorMessage(ro, { code: "something_new", message: "Raw" })).toBe("Raw");
    expect(authErrorMessage(ro, { message: "No code" })).toBe("No code");
  });
});

describe("formatters in Romanian", () => {
  test("dates, the calendar and review intervals follow the language", () => {
    expect(formatMonthYear("2026-10-09T12:00:00Z", "ro")).toBe("octombrie 2026");
    expect(formatPostDate("2026-10-09T12:00:00Z", "ro")).toBe("9 oct. 2026, 12:00");
    expect(formatCalendarDate("2026-10-13", "ro")).toBe("Marți, 13 octombrie 2026");
    expect(buildMonthGrid("2026-10", { today: "2026-10-13", language: "ro" }).label).toBe(
      "Octombrie 2026",
    );
    expect(weekdayLabels("ro")[0]).toBe("Lun");
    expect(formatInterval(45, "ro")).toBe("2l");
    expect(formatInterval(550, "ro")).toBe("1,5a");
    expect(describeInterval(21, "ro")).toBe("21 de zile");
  });

  test("English stays the default", () => {
    expect(formatCalendarDate("2026-10-13")).toBe("Tuesday, October 13, 2026");
    expect(formatInterval(45)).toBe("2mo");
    expect(describeInterval(1)).toBe("1 day");
  });
});
