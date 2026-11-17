"use client";

import { LANGUAGE_NAMES, LANGUAGES, resolveLanguage } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";
import { useSettingsWriter } from "@/lib/use-settings-writer";

export default function LanguageSettingsPage() {
  const { t } = useI18n();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });
  // No Save button: choosing writes it, and the interface switches as the
  // cache updates -- see useSettingsWriter.
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
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.languages")} />

      <div className="mt-lg flex max-w-[32rem] flex-col gap-md">
        <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
          {t("settings.languages.label")}
          <select
            value={resolveLanguage(data.settings.language)}
            disabled={write.isPending}
            onChange={(event) => write.mutate({ language: resolveLanguage(event.target.value) })}
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
        <p className="m-0 text-caption text-muted-foreground">{t("settings.autosaveHint")}</p>

        {write.isError && (
          <p role="alert" className="text-sm text-danger">
            {t("common.failedToSave", { message: (write.error as Error).message })}
          </p>
        )}
      </div>
    </PageMain>
  );
}
