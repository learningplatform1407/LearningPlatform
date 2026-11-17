"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";
import { useSettingsWriter } from "@/lib/use-settings-writer";

export default function NotificationsSettingsPage() {
  const { t } = useI18n();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });
  // No local mirror of the checkbox and no Save button: the box writes as it
  // is clicked -- see useSettingsWriter.
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
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.notifications")} />

      <div className="mt-lg flex max-w-[32rem] flex-col gap-md">
        <label className="flex items-center gap-sm text-sm text-foreground">
          <input
            type="checkbox"
            checked={data.settings.notifications_enabled}
            disabled={write.isPending}
            onChange={(event) => write.mutate({ notifications_enabled: event.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          {t("settings.notifications.enable")}
        </label>
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
