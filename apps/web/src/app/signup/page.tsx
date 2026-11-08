"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/button";

import { signup, type SignupState } from "./actions";

const initialState: SignupState = { error: null, checkEmail: false };

export default function SignupPage() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.checkEmail) {
    return (
      <AuthLayout>
        <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
          {t("auth.checkEmail")}
        </h1>
        <p className="mt-md text-sm text-muted-foreground">{t("auth.confirmationSent")}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
        {t("auth.signUp")}
      </h1>
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          {t("auth.email")}
          <input type="email" name="email" required autoComplete="email" className="field" />
        </label>
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          {t("auth.password")}
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            className="field"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? t("auth.signingUp") : t("auth.signUp")}
        </Button>
      </form>
      <p className="mt-md text-sm text-muted-foreground">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="text-accent underline underline-offset-2">
          {t("auth.logIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}
