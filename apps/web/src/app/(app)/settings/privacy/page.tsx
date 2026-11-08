"use client";

import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { useI18n } from "@/lib/i18n";

export default function PrivacySettingsPage() {
  const { t } = useI18n();
  return (
    <PageMain width="reading">
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.privacy")} />
      <p className="mt-sm text-toc text-muted-foreground">{t("settings.privacy.empty")}</p>
    </PageMain>
  );
}
