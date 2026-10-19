"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import { useState } from "react";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { createClient } from "@/lib/supabase/client";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function ProfileSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [displayName, setDisplayName] = useState("");
  const [university, setUniversity] = useState("");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Sync local form state from freshly-loaded/refetched data. Calling
  // setState during render (guarded by this identity check) is React's
  // documented pattern for this — not a useEffect, to avoid an extra
  // cascading render on every load.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setDisplayName(data.display_name ?? "");
    setUniversity(data.university ?? "");
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().updateMe({
        display_name: displayName || null,
        university: university || null,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  const avatarMutation = useMutation({
    mutationFn: (avatarUrl: string) => getBrowserApiClient().updateMe({ avatar_url: avatarUrl }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !data) return;

    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image must be under 5MB.");
      return;
    }

    setAvatarUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${data.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      await avatarMutation.mutateAsync(publicUrlData.publicUrl);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setAvatarUploading(false);
    }
  }

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="alert" className="text-sm text-danger">
          Failed to load profile: {(error as Error).message}
        </p>
      </main>
    );
  }

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Profile Settings</h1>

      <div className="mt-lg flex items-center gap-md">
        <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-medium text-muted-foreground">
          {data.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not worth next/image config for a 64px thumbnail
            <img src={data.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{(data.display_name ?? data.email ?? "?").slice(0, 1).toUpperCase()}</span>
          )}
          {avatarUploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs text-foreground">
              ...
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
            disabled={avatarUploading}
          />
        </label>
        <p className="text-sm text-muted-foreground">Click the picture to change it.</p>
      </div>
      {avatarError && (
        <p role="alert" className="mt-xs text-sm text-danger">
          {avatarError}
        </p>
      )}

      <form
        className="mt-lg flex max-w-[32rem] flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Email
          <input
            type="email"
            value={data.email ?? ""}
            disabled
            className="rounded-md border border-border bg-muted px-sm py-xs text-base text-muted-foreground"
          />
        </label>
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="flex flex-col gap-xs text-sm text-foreground">
          University
          <input
            type="text"
            value={university}
            onChange={(event) => setUniversity(event.target.value)}
            className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        {saveMutation.isError && (
          <p role="alert" className="text-sm text-danger">
            Failed to save: {(saveMutation.error as Error).message}
          </p>
        )}
        <div className="flex items-center gap-md">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
          {saveMutation.isSuccess && <span className="text-sm text-success">Saved.</span>}
        </div>
      </form>
    </main>
  );
}
