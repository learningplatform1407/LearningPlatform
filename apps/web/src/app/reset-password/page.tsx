"use client";

import { useActionState } from "react";

import { AuthLayout } from "@/components/auth-layout";
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
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-foreground">Set a new password</h1>
      <p className="mt-md text-sm text-muted-foreground">
        You&apos;ll be signed out on every device, including this one, and can log in again with the
        new password.
      </p>
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm text-foreground">
          New password
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Confirm new password
          <input
            type="password"
            name="confirm_password"
            required
            autoComplete="new-password"
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
