/** Date formatting shared by both apps.
 *
 * Lives in @lp/ui because both apps already depend on it at runtime (mobile's
 * src/lib/theme.ts re-exports its tokens, and it is listed in web's
 * next.config.ts transpilePackages), so this needs no new wiring.
 *
 * The locale is pinned rather than left to the host. `toLocaleDateString`
 * with no locale follows the device, so the same post would read "Oct 9, 2026"
 * on one phone and "09/10/2026" on another, and tests would pass or fail
 * depending on the runner's configuration.
 */

const LOCALE = "en-US";

// Built once at module load rather than per call. Every toLocaleDateString
// with an options object constructs a formatter, and formatPostDate used two
// of them -- so a 50-post feed paid 100 constructions per render pass,
// repeated on every keystroke in the composer and every refetch.
//
// Neither pins a timeZone, deliberately: a byline should read in the viewer's
// own local time. That makes exact assertions zone-dependent, which is why
// the package's test script pins TZ rather than this module pinning a zone.
const MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
const POST_DAY = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const POST_TIME = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" });

/** "October 2026" — the join date on a profile. */
export function formatMonthYear(iso: string): string {
  return MONTH_YEAR.format(new Date(iso));
}

/** "Oct 9, 2026 at 1:16 PM" — the byline on a feed post.
 *
 * Day precision plus a time, unlike formatMonthYear: several announcements
 * can land on the same day, and "which came first" is exactly what a reader
 * wants from the byline. */
export function formatPostDate(iso: string): string {
  const date = new Date(iso);
  return `${POST_DAY.format(date)} at ${POST_TIME.format(date)}`;
}
