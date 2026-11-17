/** How long the Learn hub's "Recently opened" list is.
 *
 * Shared rather than written twice: the hub is the same screen on both
 * platforms, and a hub that lists three lessons on the phone and five in the
 * browser is the kind of drift nobody notices until it is reported as a bug.
 *
 * Three, not five: the newest lesson is already pulled out above as
 * "Continue", so this list is the tail behind it -- a shortcut back to the
 * handful of lessons still in play, not a history. The Library is where every
 * lesson lives.
 */
export const RECENT_LESSONS_SHOWN = 3;
