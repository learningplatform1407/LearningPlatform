"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export interface ForgotPasswordState {
  error: string | null;
  sent: boolean;
}

/** Where Supabase should send the reader back to.
 *
 * Derived from the request rather than a `NEXT_PUBLIC_SITE_URL` so local,
 * preview and production each work without their own variable. Host headers
 * are spoofable, but Supabase ignores any `redirectTo` missing from the
 * project's Redirect URL allow-list and falls back to the site URL, which is
 * what actually makes this safe — see `docs/architecture/password-reset.md` §7.
 */
async function confirmUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");

  if (!host) {
    // Rather than emit `http://null/auth/confirm`, which Supabase would
    // discard for being off the allow-list, leaving nothing in any log.
    throw new Error("Cannot build the recovery redirect: no Host header on the request.");
  }

  // Defaults to https, with http only for local development. The reverse of
  // the obvious default, deliberately: a proxy that terminates TLS without
  // setting `x-forwarded-proto` would otherwise make production emit
  // `http://…`, which is not the `https://…` entry on the Redirect URL
  // allow-list — so Supabase silently substitutes the Site URL and *every*
  // production reset email lands on the site root with its token spent.
  const forwarded = headerList.get("x-forwarded-proto");
  const protocol = forwarded ?? (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");

  // `flow=recovery` is ours, not Supabase's. It survives the round trip
  // through the verify endpoint's redirect and is how /auth/confirm knows to
  // issue the recovery marker on the PKCE arm, where nothing else identifies
  // the flow — see that route's comment.
  return `${protocol}://${host}/auth/confirm?next=/reset-password&flow=recovery`;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Enter your email address.", sent: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await confirmUrl(),
  });

  // Deliberately not branched on whether the address has an account: Supabase
  // does not say, and an endpoint that did would let anyone test whether a
  // given person studies here. Only transport and rate-limit failures reach
  // the user. See `docs/architecture/password-reset.md` §2 before adding an
  // existence check here — the uninformative success is the feature.
  if (error) {
    return { error: error.message, sent: false };
  }

  return { error: null, sent: true };
}
