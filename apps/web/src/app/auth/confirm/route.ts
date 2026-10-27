import type { EmailOtpType, User } from "@supabase/supabase-js";
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

/** What separates the session this route just created from any other
 * signed-in session. `/reset-password` asks for no current password, so
 * without the marker it would be reachable by anyone already logged in — see
 * `lib/recovery-cookie.ts`. Bound to the user Supabase just verified, and
 * signed, so it cannot be hand-written in a devtools console. */
async function markRecovery(user: User | null): Promise<void> {
  if (!user) {
    return;
  }
  (await cookies()).set(RECOVERY_COOKIE, await signRecoveryMarker(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Turns a recovery link into a cookie session.
 *
 * Supabase can deliver that link two ways, and this accepts both so the
 * feature does not depend on which one the project is configured for.
 *
 * - **`?code=`** — the PKCE arm, which the *default* `{{ .ConfirmationURL }}`
 *   email template produces. `@supabase/ssr` sets `flowType: "pkce"`, so
 *   `resetPasswordForEmail` stores a verifier and Supabase's verify endpoint
 *   redirects here with a code to exchange. Works with the built-in email
 *   sender and no template editing — which Supabase gates behind custom
 *   SMTP. The catch is that the verifier lives in the cookies of the browser
 *   that *requested* the reset, so opening the link on a second device fails.
 * - **`?token_hash=`&`type=`** — needs a custom template passing
 *   `{{ .TokenHash }}`, and therefore custom SMTP, but carries no
 *   browser-bound state and so survives "request on my laptop, click on my
 *   phone". The arm to prefer in production.
 *
 * Supporting both makes the switchover a dashboard change rather than a code
 * change. See `docs/architecture/password-reset.md` §7.
 *
 * `/auth/confirm` is in `SESSION_AGNOSTIC_PATHS`: it runs before a session
 * exists and is the thing that creates one, so bouncing an already-signed-in
 * reader off it would silently discard the link from their inbox.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  // `flow` is ours, put into `redirectTo` by forgot-password/actions.ts and
  // round-tripped through Supabase's redirect. The PKCE arm cannot tell a
  // recovery from any other code exchange on its own, and handing the
  // recovery marker to, say, a future signup confirmation would let that
  // reader set a password without knowing the current one. `type` covers the
  // token_hash arm, where Supabase names the flow itself.
  const isRecovery = searchParams.get("flow") === "recovery" || type === "recovery";

  const supabase = await createClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (isRecovery) {
        await markRecovery(data.user);
      }
      // Throws, so nothing below runs. The cookies set through the
      // `cookies()` adapter are attached to the redirect response.
      redirect(safeNext(next, origin));
    }
  }

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      if (isRecovery) {
        await markRecovery(data.user);
      }
      redirect(safeNext(next, origin));
    }
  }

  redirect("/forgot-password?error=expired");
}
