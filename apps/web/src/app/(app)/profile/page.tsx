"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@lp/contracts";
import Link from "next/link";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { createClient } from "@/lib/supabase/client";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });

  const [mode, setMode] = useState<"view" | "edit">("view");
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
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      setMode("view");
    },
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
    // Arbitrary value, not max-w-lg — see the comment in auth-layout.tsx:
    // Tailwind's width/max-width scale shares the --spacing-* namespace.
    <main className="mx-auto max-w-[32rem] p-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </Link>
      </div>

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
        <p className="text-sm text-muted-foreground">Joined {formatJoined(data.created_at)}</p>
      </div>
      {avatarError && (
        <p role="alert" className="mt-xs text-sm text-danger">
          {avatarError}
        </p>
      )}

      {mode === "view" ? (
        <div className="mt-lg flex flex-col gap-md">
          <dl className="divide-y divide-border rounded-lg border border-border bg-background">
            {(
              [
                ["Email", data.email ?? "—"],
                ["Display name", data.display_name ?? "Not set"],
                ["University", data.university ?? "Not set"],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between px-md py-sm">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="self-start rounded-md border border-border px-md py-xs text-sm font-medium text-foreground hover:bg-muted"
          >
            Edit
          </button>
        </div>
      ) : (
        <form
          className="mt-lg flex flex-col gap-md"
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
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            University
            <input
              type="text"
              value={university}
              onChange={(event) => setUniversity(event.target.value)}
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
            />
          </label>
          {saveMutation.isError && (
            <p role="alert" className="text-sm text-danger">
              Failed to save: {(saveMutation.error as Error).message}
            </p>
          )}
          <div className="flex items-center gap-md">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDisplayName(data.display_name ?? "");
                setUniversity(data.university ?? "");
                setMode("view");
              }}
              className="rounded-md border border-border px-md py-sm text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
