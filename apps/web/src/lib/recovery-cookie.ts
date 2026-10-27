/** Proof that a session was minted by a recovery link, not merely signed in.
 *
 * `/reset-password` cannot be gated on *having* a session. A recovery link
 * produces an ordinary full session, so "is signed in" does not distinguish
 * the person who just proved they own the mailbox from anyone who wandered up
 * to an unlocked laptop — and that page sets a new password **without asking
 * for the current one**. A session-only gate makes it a one-click takeover and
 * reduces the current-password check in `settings/account` to decoration.
 *
 * ## Why the value is signed
 *
 * The first version of this stored the literal string `"1"` and relied on
 * `httpOnly`. That was wrong. `httpOnly` stops page scripts from *reading* a
 * cookie; it does not stop a person at the keyboard from *creating* one. The
 * attacker in the threat model above has a devtools console:
 *
 * ```js
 * document.cookie = "lp-recovery=1; path=/";
 * ```
 *
 * …and the server cannot tell that apart from the real marker, because they
 * are the same three characters. An unauthenticated bearer flag guarding a
 * password change is no guard at all.
 *
 * So the value is `<userId>.<expiry>.<hmac>`, signed with a server-only
 * secret. Forging it requires the secret; replaying someone else's requires
 * being that user, since the signature covers the id and the proxy checks it
 * against the live session. `httpOnly` stays, but as hygiene rather than as
 * the security property.
 *
 * Web Crypto rather than `node:crypto`: this is verified inside `proxy.ts`,
 * which Next runs on the Edge runtime where the node builtin is unavailable.
 *
 * A future alternative needing no secret is the access token's `amr` claim,
 * which is inside the server-signed JWT and so equally unforgeable — a
 * password login reads `password` where a recovery reads `otp`. Not used yet
 * because the exact method string Supabase stamps for `type: "recovery"` is
 * not something this repo can verify without a live project, and guessing
 * wrong fails closed on every genuine reset.
 */

const encoder = new TextEncoder();

export const RECOVERY_COOKIE = "lp-recovery";

/** Short enough that an abandoned reset does not leave the door open, long
 * enough to type a password twice. Baked into the signature, so an expired
 * marker cannot be revived by editing the cookie's own `Max-Age`. */
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 15 * 60;

function secret(): string {
  const value = process.env.RECOVERY_MARKER_SECRET;
  if (!value) {
    // Fail closed and loudly. Defaulting to a baked-in string would make
    // every deployment forgeable by anyone who has read this file.
    throw new Error(
      "RECOVERY_MARKER_SECRET is not configured. Add it to apps/web/.env.local — see infra/supabase/README.md.",
    );
  }
  return value;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-safe, non-short-circuiting comparison. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function signRecoveryMarker(
  userId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const expiry = nowSeconds + RECOVERY_COOKIE_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${await sign(payload)}`;
}

/** True only for a marker this server signed, for this user, not yet expired. */
export async function verifyRecoveryMarker(
  value: string | undefined,
  userId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!value) {
    return false;
  }

  const parts = value.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [markerUserId, expiryText, signature] = parts as [string, string, string];

  // Checked before the signature because a valid signature for another
  // account is still a marker this user may not use.
  if (markerUserId !== userId) {
    return false;
  }

  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(expiry) || expiry <= nowSeconds) {
    return false;
  }

  return equals(signature, await sign(`${markerUserId}.${expiryText}`));
}
