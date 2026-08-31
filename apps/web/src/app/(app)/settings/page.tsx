"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";

import { logout } from "../actions";

const THEMES = ["light", "dark", "system"] as const;
const LANGUAGES = [{ value: "en", label: "English" }] as const;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [theme, setTheme] = useState<(typeof THEMES)[number]>("system");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [language, setLanguage] = useState("en");

  // See the comment in profile/page.tsx — render-time state sync, not an effect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setTheme(data.settings.theme as (typeof THEMES)[number]);
    setNotificationsEnabled(data.settings.notifications_enabled);
    setLanguage(data.settings.language);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().updateMe({
        theme,
        notifications_enabled: notificationsEnabled,
        language,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
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
          Failed to load settings: {(error as Error).message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[32rem] p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <form
        className="mt-lg flex flex-col gap-lg"
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

        <label className="flex items-center gap-sm text-sm text-foreground">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(event) => setNotificationsEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Enable notifications
        </label>

        <label className="flex flex-col gap-xs text-sm text-foreground">
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="w-fit rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
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
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
          {saveMutation.isSuccess && <span className="text-sm text-success">Saved.</span>}
        </div>
      </form>

      <form action={logout} className="mt-2xl border-t border-border pt-lg">
        <button
          type="submit"
          className="rounded-md border border-border px-md py-xs text-sm font-medium text-foreground hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
