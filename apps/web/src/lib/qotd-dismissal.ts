/** Remembers that today's question was already dismissed.
 *
 * The question "is this the first time today?" is never asked directly.
 * Instead one key holds the **server's** date, and the widget auto-opens only
 * when the stored value differs from it. The marker therefore invalidates
 * itself the moment the institution day rolls over -- nothing to expire, and
 * no reliance on the device clock, which could be in another timezone or
 * simply wrong.
 *
 * It is a convenience, never correctness. Both accessors swallow their errors:
 * Safari in private mode throws on `setItem`, storage can be disabled
 * outright, and a cleared profile reads back empty. The worst outcome of any
 * of those is the widget offering itself once more, which is why nothing
 * about answering or scoring consults it.
 *
 * Shaped as a `useSyncExternalStore` source rather than plain get/set: the
 * auto-open rule is then a derivation from this value, instead of state
 * written from an effect. That is also what the `storage` subscription buys --
 * dismissing the day in one tab settles the others.
 *
 * This is the first `localStorage` use in apps/web, hence a module rather than
 * inline access: one place to keep the try/catch discipline.
 */

const KEY = "lp.qotd.dismissed";

/** A `YYYY-MM-DD`, or null when nothing is stored or storage is unreadable.
 *
 * Safe as a `getSnapshot`: the value is a primitive, so an unchanged marker
 * compares equal and cannot drive a render loop.
 */
export function readDismissedDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeDismissedDate(serverToday: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, serverToday);
  } catch {
    // Storage unavailable. The widget will offer itself again on the next
    // visit, which is a far better failure than refusing to render.
  }
}

/** Re-reads the marker when another tab changes it. */
export function subscribeDismissal(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  function onStorage(event: StorageEvent) {
    // `key` is null when a tab calls clear(); treat that as a change too.
    if (event.key === null || event.key === KEY) onChange();
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
