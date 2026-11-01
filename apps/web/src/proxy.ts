import { type NextRequest, NextResponse } from "next/server";

import { RECOVERY_COOKIE, verifyRecoveryMarker } from "@/lib/recovery-cookie";
import { updateSession } from "@/lib/supabase/proxy";

/** Signed out only — a signed-in reader has no business here and is sent home. */
const SIGNED_OUT_PATHS = ["/login", "/signup"];

/** Valid in either state, which is not the same as "public".
 *
 * `/auth/confirm` has to run whatever the session says: it redeems the
 * recovery token, and bouncing a signed-in reader off it would silently
 * discard the link they just clicked from their inbox.
 *
 * `/forgot-password` is reachable while signed in on purpose — somebody who
 * is logged in but cannot remember their password is exactly who the
 * "Reset it by email" link in `settings/account` is for, and requesting a
 * mail is harmless in either state.
 */
const SESSION_AGNOSTIC_PATHS = ["/auth/confirm", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;

  if (SESSION_AGNOSTIC_PATHS.includes(pathname)) {
    return response;
  }

  // Needs a session **and** the marker proving it came from a recovery link.
  // A session alone is not enough: that page sets a new password without
  // asking for the current one, so gating on "is signed in" would make it a
  // one-click takeover from any unlocked browser, and would reduce the
  // current-password check in `settings/account` to decoration. See
  // `lib/recovery-cookie.ts` and `docs/architecture/password-reset.md` §4.
  // `startsWith`, not equality: a later `/reset-password/done` must inherit
  // the gate rather than fall through to the allow-by-default branch for
  // signed-in readers, which would reintroduce the takeover this exists to
  // stop. The trailing check keeps `/reset-password-x` from matching.
  if (pathname === "/reset-password" || pathname.startsWith("/reset-password/")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // Verified, not merely present. The value is an HMAC bound to this user,
    // because `httpOnly` does not stop someone at the keyboard from writing
    // their own cookie — see `lib/recovery-cookie.ts`.
    const marker = request.cookies.get(RECOVERY_COOKIE)?.value;
    if (!(await verifyRecoveryMarker(marker, user.id))) {
      return NextResponse.redirect(new URL("/settings/account", request.url));
    }
    return response;
  }

  if (!user) {
    if (SIGNED_OUT_PATHS.includes(pathname)) {
      return response;
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (SIGNED_OUT_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - any file with an extension (images, etc.)
     *
     * `mjs` covers public/pdf.worker.min.mjs -- pdf.js's worker is loaded as
     * a plain subresource fetch of this static file, same as an image, and
     * must never be bounced through the session check: a redirect response
     * here hands the Worker an HTML login page instead of JS, which it can't
     * parse, surfacing to the user as "Failed to load the lecture PDF."
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs)$).*)",
  ],
};
