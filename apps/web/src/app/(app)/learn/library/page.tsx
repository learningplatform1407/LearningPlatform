"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { getBrowserApiClient } from "@/lib/api-client.browser";

// A deep, "leather-bound" palette rather than the app's bright UI colors —
// picked deterministically from the title so the same book always gets the
// same cover, with no cover-image field to actually render.
const BOOK_COVER_COLORS = [
  "#1e3a8a", // indigo
  "#7f1d1d", // maroon
  "#14532d", // forest green
  "#581c87", // purple
  "#854d0e", // mustard
  "#164e63", // deep cyan
  "#7c2d12", // rust
  "#0f766e", // teal
];

function coverColorForTitle(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return BOOK_COVER_COLORS[Math.abs(hash) % BOOK_COVER_COLORS.length] ?? BOOK_COVER_COLORS[0]!;
}

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
        <ul className="mt-lg grid grid-cols-2 gap-lg sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.data.map((book) => {
            const coverColor = coverColorForTitle(book.title);
            return (
              <li key={book.id}>
                <Card as={Link} href={`/learn/library/${book.id}`} interactive className="block overflow-hidden p-0">
                  <div
                    className="relative flex aspect-[2/3] flex-col justify-between p-md text-white"
                    style={{ backgroundColor: coverColor }}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-2"
                      style={{ backgroundColor: coverColor, filter: "brightness(0.65)" }}
                    />
                    <span className="relative self-start rounded-full bg-black/25 px-sm py-0.5 text-xs font-medium">
                      {book.chapter_count} {book.chapter_count === 1 ? "chapter" : "chapters"}
                    </span>
                    <p className="relative text-lg font-semibold leading-snug drop-shadow-sm">
                      {book.title}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
          {hasUncategorized && (
            <li>
              <Card
                as={Link}
                href="/learn/library/uncategorized"
                interactive
                className="block overflow-hidden p-0"
              >
                <div className="relative flex aspect-[2/3] flex-col justify-between bg-muted p-md">
                  <div aria-hidden="true" className="absolute inset-y-0 left-0 w-2 bg-border" />
                  <span className="relative self-start rounded-full bg-background/70 px-sm py-0.5 text-xs font-medium text-muted-foreground">
                    {uncategorizedLessons.length}{" "}
                    {uncategorizedLessons.length === 1 ? "lesson" : "lessons"}
                  </span>
                  <p className="relative text-lg font-semibold leading-snug text-muted-foreground">
                    Uncategorized
                  </p>
                </div>
              </Card>
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
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}
          <Button type="submit" disabled={createBookMutation.isPending} className="self-start">
            {createBookMutation.isPending ? "Creating..." : "Create book"}
          </Button>
        </form>
      )}
    </main>
  );
}
