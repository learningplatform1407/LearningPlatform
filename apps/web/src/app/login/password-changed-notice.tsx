"use client";

import { useSearchParams } from "next/navigation";

/** Why you are looking at the login form again.
 *
 * Both password paths end with `signOut({ scope: "global" })`, so the last
 * thing either does is send the reader here. Landing back on the login form
 * with no explanation, seconds after setting a password, reads as "the reset
 * failed" — and the obvious response to that is to request another link.
 *
 * Split out and wrapped in `Suspense` by the caller because
 * `useSearchParams()` opts a component into request-time rendering; keeping it
 * to this one line leaves the rest of the page prerenderable.
 */
export function PasswordChangedNotice() {
  // `?.` despite the non-nullable type: the hook really does hand back null
  // outside a router context, which is every render under vitest and any
  // prerender that reaches here before the Suspense boundary resolves. The
  // notice is not worth taking the login form down over.
  if (useSearchParams()?.get("changed") !== "1") {
    return null;
  }

  return (
    <p
      role="status"
      className="mt-md rounded-md border border-border bg-muted px-sm py-xs text-sm text-foreground"
    >
      Password changed. You&apos;ve been signed out everywhere — log in with your new password.
    </p>
  );
}
