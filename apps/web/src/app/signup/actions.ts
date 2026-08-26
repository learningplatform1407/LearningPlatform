"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface SignupState {
  error: string | null;
  checkEmail: boolean;
}

export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message, checkEmail: false };
  }

  // If email confirmation is required, Supabase returns no session yet.
  if (data.session) {
    redirect("/");
  }

  return { error: null, checkEmail: true };
}
