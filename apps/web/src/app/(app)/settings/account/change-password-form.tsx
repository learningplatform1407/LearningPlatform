"use client";

import { useActionState } from "react";

import { Button } from "@/components/button";
import { useI18n } from "@/lib/i18n";

import { changePassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = { error: null };

const inputClass = "field";

export function ChangePasswordForm() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <section className="mt-xl max-w-[32rem]">
      <h2 className="text-lg font-semibold text-foreground">{t("settings.password.title")}</h2>
      <p className="mt-xs text-sm text-muted-foreground">
        {t("settings.password.intro")}{" "}
        <a href="/forgot-password" className="text-accent underline underline-offset-2">
          {t("settings.password.resetByEmail")}
        </a>
        .
      </p>
      <form action={formAction} className="mt-md flex flex-col gap-md">
        <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
          {t("settings.password.current")}
          <input
            type="password"
            name="current_password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
          {t("settings.password.new")}
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
          {t("settings.password.confirm")}
          <input
            type="password"
            name="confirm_password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {/* No success message: the action redirects to /login, which carries
            the confirmation. This component is unmounted by then. */}
        {/* w-44: the same width as the Account page's other two buttons. */}
        <Button type="submit" className="w-44 self-start" disabled={pending}>
          {pending ? t("common.saving") : t("settings.password.submit")}
        </Button>
      </form>
    </section>
  );
}
