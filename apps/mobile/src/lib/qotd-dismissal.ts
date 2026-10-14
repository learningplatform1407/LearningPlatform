import AsyncStorage from "@react-native-async-storage/async-storage";

/** Remembers that today's question was already offered.
 *
 * The mobile half of apps/web/src/lib/qotd-dismissal.ts, same key and same
 * rule: one entry holds the **server's** date, and the overlay offers itself
 * only while the stored value differs from it. The marker therefore
 * invalidates itself the moment the institution day rolls over -- nothing to
 * expire, and no reliance on the device clock, which on a phone is exactly the
 * thing most likely to be in another timezone.
 *
 * Both calls swallow their errors. AsyncStorage can fail on a full disk or a
 * corrupted store, and the worst outcome is the overlay offering itself once
 * more, which is why nothing about answering or scoring consults it.
 *
 * Async, unlike the web version, so the read goes through react-query rather
 * than being called in render -- see daily-question-overlay.tsx.
 */

const KEY = "lp.qotd.dismissed";

export async function readDismissedDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeDismissedDate(serverToday: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, serverToday);
  } catch {
    // Storage unavailable. The overlay will offer itself again on the next
    // visit, which is a far better failure than refusing to render.
  }
}
