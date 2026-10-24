"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";

const LANGUAGES = [{ value: "en", label: "English" }] as const;

export default function LanguageSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [language, setLanguage] = useState("en");

  // See the comment in profile/page.tsx — render-time state sync, not an effect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setLanguage(data.settings.language);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getBrowserApiClient().updateMe({ language }),
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
      <h1 className="text-2xl font-bold text-foreground">Languages</h1>

      <form
        className="mt-lg flex max-w-[32rem] flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="w-fit rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
    </PageMain>
  );
}
