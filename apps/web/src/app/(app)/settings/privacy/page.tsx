"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

export default function PrivacySettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [profilePublic, setProfilePublic] = useState(false);

  // See the comment in profile/page.tsx — render-time state sync, not an effect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setProfilePublic(data.settings.profile_public);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getBrowserApiClient().updateMe({ profile_public: profilePublic }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      // Who appears in other people's lists just changed.
      void queryClient.invalidateQueries({ queryKey: ["followers"] });
      void queryClient.invalidateQueries({ queryKey: ["following"] });
    },
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

  // Search is by name only, so the API refuses a nameless public profile.
  const needsName = !data.display_name?.trim();

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.privacy")} />

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
            checked={profilePublic}
            disabled={needsName && !profilePublic}
            onChange={(event) => setProfilePublic(event.target.checked)}
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
