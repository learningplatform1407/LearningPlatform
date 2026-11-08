"use client";

import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { useI18n } from "@/lib/i18n";

export default function RoadmapPage() {
  const { t } = useI18n();
  return (
    <PageMain width="reading">
      <PageHeader kicker={t("common.comingSoonKicker")} title={t("nav.roadmap")} />
      <p className="mt-sm text-toc text-muted-foreground">{t("common.comingSoon")}</p>
    </PageMain>
  );
}
