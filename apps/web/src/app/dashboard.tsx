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
    return <p>Loading...</p>;
  }

  if (isError) {
    return <p role="alert">Failed to load profile: {(error as Error).message}</p>;
  }

  return (
    <div>
      <h1>Welcome{data.display_name ? `, ${data.display_name}` : ""}</h1>
      <dl>
        <dt>Email</dt>
        <dd>{data.email}</dd>
        <dt>University</dt>
        <dd>{data.university ?? "Not set"}</dd>
        <dt>Theme</dt>
        <dd>{data.settings.theme}</dd>
        <dt>Notifications</dt>
        <dd>{data.settings.notifications_enabled ? "Enabled" : "Disabled"}</dd>
      </dl>
      <form action={logout}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  );
}
