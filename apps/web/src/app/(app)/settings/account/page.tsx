"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/button";
import { Modal } from "@/components/modal";
import { getBrowserApiClient } from "@/lib/api-client.browser";

import { logout } from "../../actions";

export default function AccountSettingsPage() {
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
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load account: {(error as Error).message}
        </p>
      </main>
    );
  }

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Account</h1>

      <div className="mt-lg flex max-w-[32rem] flex-col gap-md">
        <p className="text-sm text-muted-foreground">{data.email}</p>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-border px-md py-xs text-sm font-medium text-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </form>
        <Button
          type="button"
          variant="danger"
          className="self-start"
          onClick={() => setDeleteOpen(true)}
        >
          Delete Account
        </Button>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Account">
        <p className="text-sm text-foreground">
          This will permanently delete your account and all of your data — lessons progress,
          flashcards, notebook entries, everything. This cannot be undone.
        </p>
        {deleteMutation.isError && (
          <p role="alert" className="mt-sm text-sm text-danger">
            Failed to delete account: {(deleteMutation.error as Error).message}
          </p>
        )}
        <div className="mt-lg flex items-center gap-md">
          <Button
            type="button"
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete my account"}
          </Button>
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className="rounded-md border border-border px-md py-xs text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </main>
  );
}
