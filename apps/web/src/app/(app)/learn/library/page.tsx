"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";

export default function LibraryPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const books = useQuery({
    queryKey: ["books"],
    queryFn: () => getBrowserApiClient().listBooks(),
  });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getBrowserApiClient().listDocuments("none"),
  });

  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createBookMutation = useMutation({
    mutationFn: () => getBrowserApiClient().createBook({ title }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create book.");
    },
  });

  if (me.isPending || books.isPending || uncategorized.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (books.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load the library: {(books.error as Error).message}
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
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Library</h1>

      {books.data.length === 0 && !hasUncategorized ? (
        <p className="mt-md text-sm text-muted-foreground">No books yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {books.data.map((book) => (
            <li key={book.id}>
              <Link
                href={`/learn/library/${book.id}`}
                className="flex items-center justify-between rounded-md border border-border px-md py-sm hover:bg-muted"
              >
                <span className="text-sm font-medium text-foreground">{book.title}</span>
                <span className="text-xs text-muted-foreground">
                  {book.chapter_count} {book.chapter_count === 1 ? "chapter" : "chapters"}
                </span>
              </Link>
            </li>
          ))}
          {hasUncategorized && (
            <li>
              <Link
                href="/learn/library/uncategorized"
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
            createBookMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-foreground">New book</h2>
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
            disabled={createBookMutation.isPending}
            className="self-start rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createBookMutation.isPending ? "Creating..." : "Create book"}
          </button>
        </form>
      )}
    </main>
  );
}
