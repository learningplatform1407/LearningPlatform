"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";
import { useSettingsWriter } from "@/lib/use-settings-writer";

export default function PrivacySettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });
  // No Save button: the box writes as it is clicked -- see useSettingsWriter.
  const write = useSettingsWriter(() => {
    // Who appears in other people's lists just changed.
    void queryClient.invalidateQueries({ queryKey: ["followers"] });
    void queryClient.invalidateQueries({ queryKey: ["following"] });
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

  const isPublic = data.settings.profile_public;
  // Search is by name only, so the API refuses a nameless public profile.
  const needsName = !data.display_name?.trim();

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.privacy")} />

      <div className="mt-lg flex max-w-[32rem] flex-col gap-md">
        <label className="flex items-center gap-sm text-sm text-foreground">
          <input
            type="checkbox"
            checked={isPublic}
            disabled={(needsName && !isPublic) || write.isPending}
            onChange={(event) => write.mutate({ profile_public: event.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          {t("settings.privacy.publicProfile")}
        </label>
        <p className="m-0 text-caption text-muted-foreground">{t("settings.privacy.publicHint")}</p>
        {needsName && (
          <p className="m-0 text-caption text-muted-foreground">
            <Link href="/settings/profile" className="font-bold text-accent hover:underline">
              {t("settings.privacy.needsName")}
            </Link>
          </p>
        )}
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
