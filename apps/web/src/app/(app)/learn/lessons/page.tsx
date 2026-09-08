"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";

export default function LessonsPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters"],
    queryFn: () => getBrowserApiClient().listChapters(),
  });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getBrowserApiClient().listDocuments("none"),
  });

  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createChapterMutation = useMutation({
    mutationFn: () => getBrowserApiClient().createChapter({ title }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["chapters"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create chapter.");
    },
  });

  if (me.isPending || chapters.isPending || uncategorized.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (chapters.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load lessons: {(chapters.error as Error).message}
        </p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const uncategorizedLessons = uncategorized.data ?? [];
  const hasUncategorized = uncategorizedLessons.length > 0;

  return (
    <main className="p-xl">
      <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
        ← Learn
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Lessons</h1>

      {chapters.data.length === 0 && !hasUncategorized ? (
        <p className="mt-md text-sm text-muted-foreground">No chapters yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {chapters.data.map((chapter) => (
            <li key={chapter.id}>
              <Link
                href={`/learn/lessons/${chapter.id}`}
                className="flex items-center justify-between rounded-md border border-border px-md py-sm hover:bg-muted"
              >
                <span className="text-sm font-medium text-foreground">{chapter.title}</span>
                <span className="text-xs text-muted-foreground">
                  {chapter.lesson_count} {chapter.lesson_count === 1 ? "lesson" : "lessons"}
                </span>
              </Link>
            </li>
          ))}
          {hasUncategorized && (
            <li>
              <Link
                href="/learn/lessons/uncategorized"
                className="flex items-center justify-between rounded-md border border-border px-md py-sm hover:bg-muted"
              >
                <span className="text-sm font-medium text-foreground">Uncategorized</span>
                <span className="text-xs text-muted-foreground">
                  {uncategorizedLessons.length}{" "}
                  {uncategorizedLessons.length === 1 ? "lesson" : "lessons"}
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}

      {isAdmin && (
        <form
          className="mt-2xl flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
          onSubmit={(event) => {
            event.preventDefault();
            setCreateError(null);
            createChapterMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-foreground">New chapter</h2>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
            />
          </label>
          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}
          <button
            type="submit"
            disabled={createChapterMutation.isPending}
            className="self-start rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createChapterMutation.isPending ? "Creating..." : "Create chapter"}
          </button>
        </form>
      )}
    </main>
  );
}
