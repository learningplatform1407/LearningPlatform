"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/button";

import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { error: null, sent: false };

export function ForgotPasswordForm({ expired }: { expired: boolean }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  // One confirmation for every submission, whether or not the address has an
  // account. Saying "no such user" here would let anybody test whether a given
  // person studies here — see `docs/architecture/password-reset.md` §2.
  if (state.sent) {
    return (
      <>
        <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
          Check your email
        </h1>
        <p className="mt-md text-sm text-muted-foreground">
          If that address has an account, we&apos;ve sent it a link to set a new password. The link
          can only be used once.
        </p>
        <p className="mt-lg text-sm text-muted-foreground">
          <Link href="/login" className="text-accent underline underline-offset-2">
            Back to log in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
        Reset your password
      </h1>
      {expired ? (
        <p role="alert" className="mt-md text-sm text-danger">
          That link has expired or was already used. Enter your email address and we&apos;ll send a
          new one.
        </p>
      ) : (
        <p className="mt-md text-sm text-muted-foreground">
          Enter the email address you signed up with.
        </p>
      )}
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          Email
          <input type="email" name="email" required autoComplete="email" className="field" />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send reset link"}
        </Button>
      </form>
      <p className="mt-md text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="text-accent underline underline-offset-2">
          Log in
        </Link>
      </p>
    </>
  );
}
