"use client";

import { useQuery } from "@tanstack/react-query";

import { LibraryPageContent } from "@/app/(app)/learn/library/library-content";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

export default function AdminLibraryPage() {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  if (me.isPending) {
    return (
      <PageMain>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  if (me.data?.role !== "admin") {
    return (
      <PageMain>
        <PageHeader kicker={t("admin.adminKicker")} title={t("library.title")} />
        <p className="mt-md text-sm font-medium text-muted-foreground">
          {t("admin.accessRequired")}
        </p>
      </PageMain>
    );
  }

  return <LibraryPageContent showAdminTools basePath="/admin/library" />;
}
