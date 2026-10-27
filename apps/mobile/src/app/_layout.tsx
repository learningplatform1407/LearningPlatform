import * as Linking from "expo-linking";
import { router, Stack } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";
import { Providers } from "@/lib/providers";
import { parseRecoveryLink, redeemRecoveryLink } from "@/lib/recovery-link";

/** Catches a recovery link and parks the reader on the reset screen.
 *
 * Runs in either auth state, because the link can arrive cold (the app was
 * launched by it) or warm (the app was already open), and in both cases the
 * session it creates must not be allowed to look like an ordinary sign-in.
 * `beginRecovery()` is what keeps the third branch below mounted while the
 * reader types.
 */
function useRecoveryLink() {
  const { beginRecovery, endRecovery } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function handle(url: string | null) {
      if (!url) {
        return;
      }
      const credential = parseRecoveryLink(url);
      if (!credential || cancelled) {
        return;
      }

      // Before redeeming, not after: redeeming is what creates the session,
      // and without the flag already set the navigator would swap to `(app)`
      // in between.
      beginRecovery();
      const error = await redeemRecoveryLink(credential);
      if (cancelled) {
        return;
      }
      if (error) {
        // A spent or expired link. Back to asking for a fresh one, rather
        // than a reset form that cannot work.
        endRecovery();
        router.replace("/forgot-password?expired=1");
        return;
      }
      router.replace("/reset-password");
    }

    // The cold-start case: getInitialURL returns the link that launched the
    // app, which addEventListener never sees.
    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", ({ url }) => void handle(url));

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [beginRecovery, endRecovery]);
}

function RootNavigator() {
  const { session, isLoading, isRecovering } = useAuth();
  useRecoveryLink();

  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session && !isRecovering}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      {/* The third branch, and the reason it exists: a recovery session
          satisfies `!!session`, so without this the reader would be thrown
          into `(app)` before setting a password. */}
      <Stack.Protected guard={isRecovering}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !isRecovering}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Providers>
      <RootNavigator />
    </Providers>
  );
}
