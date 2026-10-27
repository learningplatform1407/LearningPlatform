"use client";

import { useActionState } from "react";

import { Button } from "@/components/button";

import { changePassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = { error: null };

const inputClass =
  "rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <section className="mt-xl max-w-[32rem]">
      <h2 className="text-lg font-semibold text-foreground">Change password</h2>
      <p className="mt-xs text-sm text-muted-foreground">
        You&apos;ll be signed out on every device, including this one. Forgotten it instead?{" "}
        <a href="/forgot-password" className="text-primary hover:underline">
          Reset it by email
        </a>
        .
      </p>
      <form action={formAction} className="mt-md flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Current password
          <input
            type="password"
            name="current_password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm text-foreground">
          New password
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Confirm new password
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
        <Button type="submit" className="self-start" disabled={pending}>
          {pending ? "Saving..." : "Change password"}
        </Button>
      </form>
    </section>
  );
}
