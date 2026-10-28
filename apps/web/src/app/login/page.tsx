"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/button";

import { login, type LoginState } from "./actions";
import { PasswordChangedNotice } from "./password-changed-notice";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-foreground">Log in</h1>
      <Suspense fallback={null}>
        <PasswordChangedNotice />
      </Suspense>
      <form action={formAction} className="mt-lg flex flex-col gap-md">
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Logging in..." : "Log in"}
        </Button>
      </form>
      <p className="mt-md text-sm text-muted-foreground">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-xs text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
