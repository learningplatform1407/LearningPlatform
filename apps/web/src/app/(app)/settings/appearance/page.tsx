"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { SegmentedSwitch } from "@/components/segmented-switch";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";
import { useSettingsWriter } from "@/lib/use-settings-writer";

const THEME_CHOICES = ["light", "dark", "system"] as const;

type ThemeChoice = (typeof THEME_CHOICES)[number];

export default function AppearanceSettingsPage() {
  const { t } = useI18n();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });
  // No Save button: picking a theme writes it -- see useSettingsWriter. The
  // page re-themes itself as the cache updates, which is the confirmation.
  const write = useSettingsWriter();

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

      <div className="mt-lg flex max-w-[32rem] flex-col gap-md">
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
            value={(data.settings.theme as ThemeChoice) ?? "system"}
            onChange={(theme) => write.mutate({ theme })}
            className="w-fit"
          />
          <p className="text-caption text-muted-foreground">{t("settings.appearance.hintWeb")}</p>
          <p className="m-0 text-caption text-muted-foreground">{t("settings.autosaveHint")}</p>
        </div>

        {write.isError && (
          <p role="alert" className="text-sm text-danger">
            {t("common.failedToSave", { message: (write.error as Error).message })}
          </p>
        )}
      </div>
    </PageMain>
  );
}
