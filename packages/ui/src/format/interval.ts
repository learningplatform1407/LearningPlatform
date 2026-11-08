import type { Language } from "../i18n/languages";
import { getTranslator } from "../i18n/translate";

const UNITS: Record<Language, { day: string; month: string; year: string }> = {
  en: { day: "d", month: "mo", year: "y" },
  ro: { day: "z", month: "l", year: "a" },
};

/**
 * A review interval in days, as short as the grade buttons need it
 * (design.md §11): "1d", "12d", "3mo", "1.5y" -- in Romanian "1z", "3l",
 * "1,5a". Months are 30 days and years 365 -- this is a hint about scale,
 * not a date.
 */
export function formatInterval(days: number, language: Language = "en"): string {
  const unit = UNITS[language];
  if (days < 30) return `${days}${unit.day}`;
  if (days < 365) return `${Math.round(days / 30)}${unit.month}`;
  const years = days / 365;
  const value = years < 10 ? Number(years.toFixed(1)) : Math.round(years);
  return `${language === "ro" ? String(value).replace(".", ",") : value}${unit.year}`;
}

/** The same interval in words, for screen readers and toasts. */
export function describeInterval(days: number, language: Language = "en"): string {
  return getTranslator(language).t("common.days", { count: days });
}
