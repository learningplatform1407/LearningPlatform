"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/button";
import { useI18n } from "@/lib/i18n";

import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { error: null, sent: false };

export function ForgotPasswordForm({ expired }: { expired: boolean }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  // One confirmation for every submission, whether or not the address has an
  // account. Saying "no such user" here would let anybody test whether a given
  // person studies here — see `docs/architecture/password-reset.md` §2.
  if (state.sent) {
    return (
      <>
        <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
          {t("auth.checkEmail")}
        </h1>
        <p className="mt-md text-sm text-muted-foreground">{t("auth.resetSent")}</p>
        <p className="mt-lg text-sm text-muted-foreground">
          <Link href="/login" className="text-accent underline underline-offset-2">
            {t("auth.backToLogIn")}
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
        {t("auth.resetTitle")}
      </h1>
      {expired ? (
        <p role="alert" className="mt-md text-sm text-danger">
          {t("auth.resetExpired")}
        </p>
      ) : (
        <p className="mt-md text-sm text-muted-foreground">{t("auth.resetIntro")}</p>
      )}
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          {t("auth.email")}
          <input type="email" name="email" required autoComplete="email" className="field" />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? t("auth.sending") : t("auth.sendResetLink")}
        </Button>
      </form>
      <p className="mt-md text-sm text-muted-foreground">
        {t("auth.remembered")}{" "}
        <Link href="/login" className="text-accent underline underline-offset-2">
          {t("auth.logIn")}
        </Link>
      </p>
    </>
  );
}
