"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import { LANGUAGE_NAMES, LANGUAGES, resolveLanguage, type Language } from "@lp/ui";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

export default function LanguageSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [language, setLanguage] = useState<Language>("en");

  // See the comment in profile/page.tsx — render-time state sync, not an effect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setLanguage(resolveLanguage(data.settings.language));
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getBrowserApiClient().updateMe({ language }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  if (isPending) {
    return (
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  if (isError) {
    return (
      <PageMain width="reading">
        <p role="alert" className="text-sm text-danger">
          {t("common.failedToLoadSettings", { message: (error as Error).message })}
        </p>
      </PageMain>
    );
  }

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.languages")} />

      <form
        className="mt-lg flex max-w-[32rem] flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
          {t("settings.languages.label")}
          <select
            value={language}
            onChange={(event) => setLanguage(resolveLanguage(event.target.value))}
            className="field w-fit!"
          >
            {LANGUAGES.map((code) => (
              // Each name in its own language, so it reads whatever the
              // interface is currently in.
              <option key={code} value={code} lang={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-caption text-muted-foreground">{t("settings.languages.hint")}</p>

        {saveMutation.isError && (
          <p role="alert" className="text-sm text-danger">
            {t("common.failedToSave", { message: (saveMutation.error as Error).message })}
          </p>
        )}
        <div className="flex items-center gap-md">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
          {saveMutation.isSuccess && (
            <span className="text-sm text-success">{t("common.saved")}</span>
          )}
        </div>
      </form>
    </PageMain>
  );
}
