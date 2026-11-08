"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { SegmentedSwitch } from "@/components/segmented-switch";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

const THEME_CHOICES = ["light", "dark", "system"] as const;

type ThemeChoice = (typeof THEME_CHOICES)[number];

export default function AppearanceSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [theme, setTheme] = useState<ThemeChoice>("system");

  // See the comment in profile/page.tsx — render-time state sync, not an effect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setTheme(data.settings.theme as ThemeChoice);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getBrowserApiClient().updateMe({ theme }),
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
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.appearance")} />

      <form
        className="mt-lg flex max-w-[32rem] flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div className="flex flex-col gap-sm">
          <span className="text-toc font-semibold text-foreground">
            {t("settings.appearance.theme")}
          </span>
          <SegmentedSwitch
            label={t("settings.appearance.theme")}
            options={THEME_CHOICES.map((value) => ({
              value,
              label: t(`settings.appearance.${value}`),
            }))}
            value={theme}
            onChange={setTheme}
            className="w-fit"
          />
          <p className="text-caption text-muted-foreground">{t("settings.appearance.hintWeb")}</p>
        </div>

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
            <span className="text-sm font-semibold text-good">{t("common.saved")}</span>
          )}
        </div>
      </form>
    </PageMain>
  );
}
