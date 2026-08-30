"use client";

import { useQuery } from "@tanstack/react-query";

import { getBrowserApiClient } from "@/lib/api-client.browser";

import { logout } from "./actions";

export function Dashboard() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="alert" className="text-sm text-danger">
          Failed to load profile: {(error as Error).message}
        </p>
      </main>
    );
  }

  const rows: Array<[string, string]> = [
    ["Email", data.email ?? "—"],
    ["University", data.university ?? "Not set"],
    ["Theme", data.settings.theme],
    ["Notifications", data.settings.notifications_enabled ? "Enabled" : "Disabled"],
  ];

  return (
    // Arbitrary value, not max-w-lg — see the comment in auth-layout.tsx:
    // Tailwind's width/max-width scale shares the --spacing-* namespace.
    <main className="mx-auto max-w-[32rem] p-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome{data.display_name ? `, ${data.display_name}` : ""}
        </h1>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-border px-md py-xs text-sm font-medium text-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </div>
      <dl className="mt-lg divide-y divide-border rounded-lg border border-border bg-background">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between px-md py-sm">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
