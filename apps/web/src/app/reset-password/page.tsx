"use client";

import { useActionState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/button";

import { resetPassword, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = { error: null };

/** Reached only with a recovery session already established by
 * `/auth/confirm`, which is why this path is deliberately **absent** from
 * `PUBLIC_PATHS` in `src/proxy.ts`: listing it would trip the
 * `user && isPublicPath` rule and bounce the reader to `/` before they ever
 * submit. The same omission means a stale bookmark lands on `/login`, which is
 * the right answer for a spent link. See `password-reset.md` §4. */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <AuthLayout>
      <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
        {t("auth.newPasswordTitle")}
      </h1>
      <p className="mt-md text-sm text-muted-foreground">{t("auth.newPasswordIntro")}</p>
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          {t("settings.password.new")}
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            className="field"
          />
        </label>
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          {t("settings.password.confirm")}
          <input
            type="password"
            name="confirm_password"
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
          {pending ? t("common.saving") : t("auth.saveNewPassword")}
        </Button>
      </form>
    </AuthLayout>
  );
}
