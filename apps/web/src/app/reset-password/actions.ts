"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RECOVERY_COOKIE, verifyRecoveryMarker } from "@/lib/recovery-cookie";
import { createClient } from "@/lib/supabase/server";

export interface ResetPasswordState {
  error: string | null;
}

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");

  if (!password) {
    return { error: "Enter a new password." };
  }
  // Ours, not a strength rule: the minimum length is Supabase's to enforce,
  // and a second stricter rule here would only disagree with it.
  if (password !== confirmation) {
    return { error: "Those passwords do not match." };
  }

  const supabase = await createClient();
  const cookieStore = await cookies();

  // A Server Action is a POST endpoint reachable without going through the UI,
  // so both gates are re-applied here rather than trusting that `src/proxy.ts`
  // vetted the page that rendered the form. The marker matters as much as the
  // session: this action changes a password without asking for the current
  // one, so an ordinary signed-in caller must not be able to reach it.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/forgot-password?error=expired");
  }
  if (!(await verifyRecoveryMarker(cookieStore.get(RECOVERY_COOKIE)?.value, user.id))) {
    redirect("/settings/account");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  // People reset a password because they think somebody else has it, and by
  // default every existing session survives the change — including the
  // attacker's. `global` rather than `others`: this browser is signed out too,
  // because a recovery session was minted by whoever opened the mail, and
  // treating that as proof of identity for the rest of the day is exactly the
  // assumption a stolen mailbox breaks.
  await supabase.auth.signOut({ scope: "global" });

  // Spent along with the token. `signOut` clears Supabase's own cookies but
  // knows nothing about this one, and leaving it behind would keep
  // `/reset-password` reachable for the rest of its 15 minutes.
  cookieStore.delete(RECOVERY_COOKIE);

  // Not `/learn`: there is no session left, so the proxy would bounce it to
  // `/login` anyway — just with no explanation of why.
  redirect("/login?changed=1");
}
