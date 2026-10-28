import { Redirect } from "expo-router";

/** The authenticated app's landing route, and the mobile counterpart of
 * `apps/web/src/app/(app)/page.tsx`.
 *
 * Without it nothing in this group answers to `/`. Signed out it happens to
 * work — the router falls back to `login` — but the moment a session arrives
 * and `_layout.tsx` swaps to the `(app)` branch, the pending `/` navigation
 * has nowhere to land and expo-router renders its Unmatched Route screen
 * (`mobile:///`). Expo Go always opens the app at `/`, so this was every
 * first login on a device.
 *
 * Hidden from both navigators in `_layout.tsx` — it is a redirect, not a
 * destination.
 */
export default function AppIndexScreen() {
  return <Redirect href="/learn" />;
}
