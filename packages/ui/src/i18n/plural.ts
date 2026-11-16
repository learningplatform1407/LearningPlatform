import type { Language } from "./languages";

/** A message that changes with a count. `few` is Romanian's 2–19 form
 * ("3 lecții"); `other` is everything else, including Romanian's 20+
 * ("20 de lecții") and English's plural. `selectPluralForm` picks the form. */
export interface Plural {
  readonly one: string;
  readonly few?: string;
  readonly other: string;
}

export function plural(forms: Plural): Plural {
  return forms;
}

/** The CLDR plural categories the catalogues carry a form for. */
export type PluralForm = keyof Plural;

/**
 * CLDR's plural rules for the languages we ship, written out rather than
 * read from `Intl.PluralRules`.
 *
 * Hermes (React Native) ships a partial `Intl` — `DateTimeFormat`,
 * `NumberFormat` and `Collator`, but no `PluralRules` — so constructing one
 * crashed every mobile screen on startup. Two languages' rules are four
 * lines, they are the rules ICU applies (`index.test.ts` checks every count
 * 0–1200 against `Intl.PluralRules`), and keeping them here means web and
 * mobile pick forms the same way, rather than one going through ICU and the
 * other through a polyfill's locale data.
 *
 * `n` is the count, `i` its integer part and `v` its visible decimals, as in
 * https://www.unicode.org/cldr/charts/47/supplemental/language_plural_rules.html
 */
const PLURAL_RULES: Record<Language, (n: number) => PluralForm> = {
  // one: i = 1 and v = 0
  en: (n) => (Number.isInteger(n) && Math.abs(n) === 1 ? "one" : "other"),

  // one: i = 1 and v = 0
  // few: v != 0 or n = 0 or n != 1 and n % 100 = 1..19
  ro: (n) => {
    const abs = Math.abs(n);
    if (!Number.isInteger(abs)) return "few";
    if (abs === 1) return "one";
    const hundreds = abs % 100;
    return abs === 0 || (hundreds >= 1 && hundreds <= 19) ? "few" : "other";
  },
};

/** Which form of a `plural()` entry `count` takes in `language`. */
export function selectPluralForm(language: Language, count: number): PluralForm {
  return PLURAL_RULES[language](count);
}
