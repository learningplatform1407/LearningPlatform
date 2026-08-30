"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthLayout } from "@/components/auth-layout";

import { signup, type SignupState } from "./actions";

const initialState: SignupState = { error: null, checkEmail: false };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.checkEmail) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold text-foreground">Check your email</h1>
        <p className="mt-md text-sm text-muted-foreground">
          We sent you a confirmation link. Follow it to finish creating your account.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-foreground">Sign up</h1>
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Signing up..." : "Sign up"}
        </button>
      </form>
      <p className="mt-md text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
