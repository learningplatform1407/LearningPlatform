/** Date formatting shared by both apps.
 *
 * Lives in @lp/ui because both apps already depend on it at runtime (mobile's
 * src/lib/theme.ts re-exports its tokens, and it is listed in web's
 * next.config.ts transpilePackages), so this needs no new wiring.
 *
 * The locale follows the reader's interface language (`language`, English
 * by default) and is otherwise pinned rather than left to the host. `toLocaleDateString`
 * with no locale follows the device, so the same post would read "Oct 9, 2026"
 * on one phone and "09/10/2026" on another, and tests would pass or fail
 * depending on the runner's configuration.
 */

import { LOCALE_TAGS, type Language } from "../i18n/languages";

// Built once at module load rather than per call. Every toLocaleDateString
// with an options object constructs a formatter, and formatPostDate used two
// of them -- so a 50-post feed paid 100 constructions per render pass,
// repeated on every keystroke in the composer and every refetch.
//
// Neither pins a timeZone, deliberately: a byline should read in the viewer's
// own local time. That makes exact assertions zone-dependent, which is why
// the package's test script pins TZ rather than this module pinning a zone.
// One set per language, built on first use.
const formatters = new Map<
  Language,
  { monthYear: Intl.DateTimeFormat; postDay: Intl.DateTimeFormat; postTime: Intl.DateTimeFormat }
>();

function formattersFor(language: Language) {
  let set = formatters.get(language);
  if (!set) {
    const locale = LOCALE_TAGS[language];
    set = {
      monthYear: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
      postDay: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }),
      postTime: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
    };
    formatters.set(language, set);
  }
  return set;
}

/** "October 2026" ("octombrie 2026") — the join date on a profile. */
export function formatMonthYear(iso: string, language: Language = "en"): string {
  return formattersFor(language).monthYear.format(new Date(iso));
}

/** "Oct 9, 2026 at 1:16 PM" ("9 oct. 2026, 13:16") — the byline on a feed post.
 *
 * Day precision plus a time, unlike formatMonthYear: several announcements
 * can land on the same day, and "which came first" is exactly what a reader
 * wants from the byline. */
export function formatPostDate(iso: string, language: Language = "en"): string {
  const date = new Date(iso);
  const { postDay, postTime } = formattersFor(language);
  const day = postDay.format(date);
  const time = postTime.format(date);
  return language === "ro" ? `${day}, ${time}` : `${day} at ${time}`;
}
