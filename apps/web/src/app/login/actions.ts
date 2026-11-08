"use server";

import { authErrorMessage } from "@lp/ui";
import { redirect } from "next/navigation";

import { getServerTranslator } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: authErrorMessage(await getServerTranslator(), error) };
  }

  redirect("/learn");
}
