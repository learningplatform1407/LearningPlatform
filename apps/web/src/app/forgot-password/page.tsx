import { AuthLayout } from "@/components/auth-layout";

import { ForgotPasswordForm } from "./form";

/** Server component purely to read `searchParams`, which `/auth/confirm` sets
 * to `error=expired` when a recovery token is stale or already spent. The form
 * itself is a client component so it can use `useActionState` like
 * `login/page.tsx` does. */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthLayout>
      <ForgotPasswordForm expired={error === "expired"} />
    </AuthLayout>
  );
}
