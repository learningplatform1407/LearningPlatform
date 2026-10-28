import { supabase } from "./supabase";

/** What a recovery link carries, which depends on the email template.
 *
 * - `tokens` — the **implicit** flow. `supabase.ts` leaves `flowType` at its
 *   default, so Supabase's verify endpoint appends the session to the
 *   fragment: `learningplatform://reset-password#access_token=…`. This is
 *   what the *default* `{{ .ConfirmationURL }}` template produces, and so
 *   what works with no dashboard changes beyond the allow-list.
 * - `tokenHash` — the custom `{{ .TokenHash }}` template, the same arm the
 *   web handler prefers. Needs custom SMTP, and in exchange carries no
 *   browser-bound state.
 *
 * Both are accepted for the same reason as on web: which one arrives is a
 * dashboard setting, and the app should not have to care.
 */
export type RecoveryCredential =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "tokenHash"; tokenHash: string };

/** Hand-rolled rather than `URLSearchParams`, whose React Native polyfill is
 * incomplete, and rather than `Linking.parse`, which does not surface the
 * fragment that the implicit flow puts the session in. */
function readParams(segment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of segment.split("&")) {
    const index = pair.indexOf("=");
    if (index <= 0) {
      continue;
    }
    try {
      out[decodeURIComponent(pair.slice(0, index))] = decodeURIComponent(pair.slice(index + 1));
    } catch {
      // A malformed escape in a URL we did not build. Skip the pair rather
      // than throw out of a deep-link handler.
    }
  }
  return out;
}

/** Null for any link that is not a password recovery.
 *
 * Gated on `type=recovery` (Supabase's own, on the implicit arm) or
 * `flow=recovery` (ours, added to `redirectTo`). Without that gate a
 * magic-link or email-confirmation deep link would be taken for a recovery
 * and drop the reader on the set-a-password screen.
 */
export function parseRecoveryLink(url: string): RecoveryCredential | null {
  const [beforeHash = "", hash = ""] = url.split("#");
  const query = beforeHash.includes("?") ? beforeHash.slice(beforeHash.indexOf("?") + 1) : "";

  const fragment = readParams(hash);
  const search = readParams(query);
  const value = (name: string) => fragment[name] ?? search[name];

  if (value("type") !== "recovery" && value("flow") !== "recovery") {
    return null;
  }

  const accessToken = value("access_token");
  const refreshToken = value("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }

  const tokenHash = value("token_hash");
  if (tokenHash) {
    return { kind: "tokenHash", tokenHash };
  }

  return null;
}

/** Turns the credential into a live session. Kept apart from parsing so the
 * parsing stays testable without a Supabase client. */
export async function redeemRecoveryLink(credential: RecoveryCredential): Promise<Error | null> {
  const { error } =
    credential.kind === "tokens"
      ? await supabase.auth.setSession({
          access_token: credential.accessToken,
          refresh_token: credential.refreshToken,
        })
      : await supabase.auth.verifyOtp({ type: "recovery", token_hash: credential.tokenHash });

  return error ?? null;
}
