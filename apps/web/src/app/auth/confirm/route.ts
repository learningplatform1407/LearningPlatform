import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  RECOVERY_COOKIE,
  RECOVERY_COOKIE_MAX_AGE_SECONDS,
  signRecoveryMarker,
} from "@/lib/recovery-cookie";
import { createClient } from "@/lib/supabase/server";

/** Only same-origin destinations are honoured.
 *
 * `next` arrives in a URL anyone can craft, and this route hands out a freshly
 * minted session, so echoing an arbitrary value into `redirect` would be an
 * open redirect that carries real credentials.
 *
 * Resolved with the URL parser rather than string-prefix checks, because the
 * invariant is "same origin" and only the parser knows what the browser will
 * conclude. The earlier `startsWith("/") && !startsWith("//")` version let
 * `/\evil.test` through — WHATWG treats a backslash as a slash for special
 * schemes, so that parses to origin `http://evil.test`. Every such trick
 * costs another prefix check; delegating to the parser costs none.
 */
function safeNext(next: string | null, origin: string): string {
  if (!next) {
    return "/reset-password";
  }
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin !== origin) {
      return "/reset-password";
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/reset-password";
  }
}

/** Turns a recovery link into a cookie session.
 *
 * The default Supabase email template sends `{{ .ConfirmationURL }}`, which
 * assumes the client-side hash-fragment flow. This app keeps its session in
 * cookies via `@supabase/ssr`, so the template has to pass `{{ .TokenHash }}`
 * to this handler instead and let the exchange happen server-side — see
 * `docs/architecture/password-reset.md` §7.
 *
 * `/auth/confirm` is in `PUBLIC_PATHS`: it runs before a session exists and is
 * the thing that creates one.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // What distinguishes the session this just created from any other
      // signed-in session. `/reset-password` asks for no current password, so
      // without this marker it would be reachable by anyone already logged in
      // — see `lib/recovery-cookie.ts`.
      //
      // Bound to the user Supabase just verified, and signed, so it cannot be
      // hand-written in a devtools console.
      if (type === "recovery" && data.user) {
        (await cookies()).set(RECOVERY_COOKIE, await signRecoveryMarker(data.user.id), {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
        });
      }

      // Throws, so nothing below runs. The cookies `verifyOtp` and the call
      // above set through the `cookies()` adapter are attached to the
      // redirect response.
      redirect(safeNext(next, origin));
    }
  }

  redirect("/forgot-password?error=expired");
}
