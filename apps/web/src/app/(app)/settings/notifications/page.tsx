"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import { useState } from "react";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";

export default function NotificationsSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // See the comment in profile/page.tsx — render-time state sync, not an effect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setNotificationsEnabled(data.settings.notifications_enabled);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().updateMe({ notifications_enabled: notificationsEnabled }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  if (isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load settings: {(error as Error).message}
        </p>
      </main>
    );
  }

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>

      <form
        className="mt-lg flex max-w-[32rem] flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <label className="flex items-center gap-sm text-sm text-foreground">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(event) => setNotificationsEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Enable notifications
        </label>

        {saveMutation.isError && (
          <p role="alert" className="text-sm text-danger">
            Failed to save: {(saveMutation.error as Error).message}
          </p>
        )}
        <div className="flex items-center gap-md">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
          {saveMutation.isSuccess && <span className="text-sm text-success">Saved.</span>}
        </div>
      </form>
    </main>
  );
}
