"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/button";

import { signup, type SignupState } from "./actions";

const initialState: SignupState = { error: null, checkEmail: false };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.checkEmail) {
    return (
      <AuthLayout>
        <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">
          Check your email
        </h1>
        <p className="mt-md text-sm text-muted-foreground">
          We sent you a confirmation link. Follow it to finish creating your account.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-[26px] leading-[1.15] font-extrabold text-foreground">Sign up</h1>
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          Email
          <input type="email" name="email" required autoComplete="email" className="field" />
        </label>
        <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
          Password
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
          {pending ? "Signing up..." : "Sign up"}
        </Button>
      </form>
      <p className="mt-md text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline underline-offset-2">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
