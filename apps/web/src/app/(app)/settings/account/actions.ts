"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** No success flag: a change always ends in a redirect to `/login`, because
 * it signs this session out along with the others. */
export interface ChangePasswordState {
  error: string | null;
}

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !password) {
    return { error: "Fill in every field." };
  }
  if (password !== confirmation) {
    return { error: "Those passwords do not match." };
  }
  if (password === currentPassword) {
    return { error: "That is already your password." };
  }

  const supabase = await createClient();

  // Re-checked here rather than trusting the page's own gate: a Server Action
  // is a POST endpoint reachable without going through the UI.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "You are not signed in." };
  }

  // Supabase accepts `updateUser` on the strength of the session alone.
  // Demanding the current password is ours: without it, anyone who finds an
  // unlocked laptop can take the account over in silence.
  //
  // Verified on a throwaway client with `persistSession` off, so a successful
  // sign-in here cannot rotate the cookie session the caller is browsing with.
  // Note this client is never signed out — `signOut()` defaults to global
  // scope and would end every session the user has.
  const verifier = createPlainClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrongPassword } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (wrongPassword) {
    return { error: "That is not your current password." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  // Same rule as recovery: a password change ends every session, this one
  // included. One law rather than two — somebody who changes their password
  // because they suspect a housemate knows it should not have to know that
  // Settings protects them less than the emailed link would.
  //
  // `global`, so the browser that just made the change is signed out as well.
  // Mildly annoying, and the point: it is the only version of this where
  // "everything is logged out" is literally true.
  await supabase.auth.signOut({ scope: "global" });

  redirect("/login?changed=1");
}
