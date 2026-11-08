"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/button";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

import { logout } from "../../actions";

import { ChangePasswordForm } from "./change-password-form";

/** The page's three actions share one width (Change password too, in its
 * form), so they line up as a set. */
const ACCOUNT_BUTTON = "w-44";

export default function AccountSettingsPage() {
  const { t } = useI18n();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);

  // No onSuccess handler needed: `logout()` is a server action that redirects
  // to /login, which unmounts this page before any local state update would
  // matter.
  const deleteMutation = useMutation({
    mutationFn: () => getBrowserApiClient().deleteMe(),
    onSuccess: () => logout(),
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
          {t("settings.account.failedToLoad", { message: (error as Error).message })}
        </p>
      </PageMain>
    );
  }

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("settings.title")} title={t("settings.sections.account")} />

      <div className="mt-lg flex max-w-[32rem] flex-col gap-md">
        <p className="text-sm text-muted-foreground">{data.email}</p>
        <form action={logout}>
          <Button type="submit" variant="secondary" className={ACCOUNT_BUTTON}>
            {t("settings.account.signOut")}
          </Button>
        </form>
      </div>

      <ChangePasswordForm />

      {/* Last on the page, below the password form: the only irreversible
          action here, and it used to sit directly under Sign out. */}
      <div className="mt-xl max-w-[32rem]">
        <Button
          type="button"
          variant="danger"
          className={ACCOUNT_BUTTON}
          onClick={() => setDeleteOpen(true)}
        >
          {t("settings.account.deleteAccount")}
        </Button>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("settings.account.deleteAccount")}
      >
        <p className="text-sm text-foreground">{t("settings.account.deleteWarning")}</p>
        {deleteMutation.isError && (
          <p role="alert" className="mt-sm text-sm text-danger">
            {t("settings.account.deleteFailed", {
              message: (deleteMutation.error as Error).message,
            })}
          </p>
        )}
        <div className="mt-lg flex items-center gap-md">
          <Button
            type="button"
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? t("common.deleting") : t("settings.account.deleteConfirm")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Modal>
    </PageMain>
  );
}
