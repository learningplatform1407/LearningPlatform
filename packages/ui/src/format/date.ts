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

/** "October 2026" — the join date on a profile. */
export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** "Oct 9, 2026 at 1:16 PM" — the byline on a feed post.
 *
 * Day precision plus a time, unlike formatMonthYear: several announcements
 * can land on the same day, and "which came first" is exactly what a reader
 * wants from the byline. */
export function formatPostDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}
