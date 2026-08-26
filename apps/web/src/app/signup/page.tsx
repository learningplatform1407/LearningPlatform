"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signup, type SignupState } from "./actions";

const initialState: SignupState = { error: null, checkEmail: false };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.checkEmail) {
    return (
      <main>
        <h1>Check your email</h1>
        <p>We sent you a confirmation link. Follow it to finish creating your account.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Sign up</h1>
      <form action={formAction}>
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" name="password" required autoComplete="new-password" />
        </label>
        {state.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Signing up..." : "Sign up"}
        </button>
      </form>
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
