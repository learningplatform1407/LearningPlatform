"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";

const THEMES = ["light", "dark", "system"] as const;

export default function AppearanceSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [theme, setTheme] = useState<(typeof THEMES)[number]>("system");

  // See the comment in profile/page.tsx — render-time state sync, not an effect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setTheme(data.settings.theme as (typeof THEMES)[number]);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getBrowserApiClient().updateMe({ theme }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  if (isPending) {
    return (
      <PageMain>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageMain>
    );
  }

  if (isError) {
    return (
      <PageMain>
        <p role="alert" className="text-sm text-danger">
          Failed to load settings: {(error as Error).message}
        </p>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <h1 className="text-2xl font-bold text-foreground">Appearance</h1>

      <form
        className="mt-lg flex max-w-[32rem] flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div className="flex flex-col gap-xs">
          <span className="text-sm font-medium text-foreground">Theme</span>
          <div className="inline-flex w-fit rounded-md border border-border p-xs">
            {THEMES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={`rounded px-md py-xs text-sm font-medium capitalize ${
                  theme === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Dark mode isn&apos;t implemented yet — this just saves your preference for later.
          </p>
        </div>

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
    </PageMain>
  );
}
