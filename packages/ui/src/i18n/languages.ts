/** The interface languages, and how a stored or detected value maps onto one.
 *
 * `settings.language` on the account is a free string server-side (validated
 * to these codes on write), so every reader goes through `resolveLanguage`
 * rather than trusting the value. */

export const LANGUAGES = ["en", "ro"] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

/** Each language's name in itself, so a reader who can't read the current
 * interface can still find their own. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  ro: "Română",
};

/** The BCP 47 tag handed to `Intl` for dates, numbers and plural rules. */
export const LOCALE_TAGS: Record<Language, string> = {
  en: "en-US",
  ro: "ro-RO",
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** A language code, a locale tag ("ro-RO") or an Accept-Language header
 * ("ro-RO,ro;q=0.9,en;q=0.8") → the first supported language, else
 * `fallback`. */
export function resolveLanguage(
  value: string | null | undefined,
  fallback: Language = DEFAULT_LANGUAGE,
): Language {
  if (!value) return fallback;
  for (const part of value.split(",")) {
    const code = part.split(";")[0]!.trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) return code;
  }
  return fallback;
}
