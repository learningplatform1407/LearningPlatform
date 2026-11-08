"use client";

import { coverColorForTitle } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

/** The book grid and (for admins, from `/admin/library`) the "New book" form.
 * Shared by the regular `/learn/library` route (`showAdminTools` always
 * false -- creating a book is an admin tool, not something that belongs on
 * the page every learner browses) and `/admin/library` (`showAdminTools`
 * true, after its own role gate). `basePath` points book/uncategorized links
 * at the right tree -- `/learn/library` or `/admin/library` -- so an admin
 * managing content from the Admin section stays inside it while browsing. */
export function LibraryPageContent({
  showAdminTools,
  basePath,
}: {
  showAdminTools: boolean;
  basePath: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
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
      setCreateError(err instanceof Error ? err.message : t("library.createFailed"));
    },
  });

  if (books.isPending || uncategorized.isPending) {
    return (
      <PageMain>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  if (books.isError) {
    return (
      <PageMain>
        <p role="alert" className="text-sm text-danger">
          {t("library.loadFailed", { message: (books.error as Error).message })}
        </p>
      </PageMain>
    );
  }

  const uncategorizedLessons = uncategorized.data ?? [];
  const hasUncategorized = uncategorizedLessons.length > 0;

  return (
    <PageMain>
      <PageHeader kicker={t("nav.learn")} title={t("library.title")} />

      {books.data.length === 0 && !hasUncategorized ? (
        <p className="mt-md text-sm text-muted-foreground">{t("library.empty")}</p>
      ) : (
        <ul className="mt-lg grid grid-cols-2 gap-md sm:grid-cols-3 md:grid-cols-4">
          {books.data.map((book) => {
            const coverColor = coverColorForTitle(book.title);
            return (
              <li key={book.id}>
                <Card
                  as={Link}
                  href={`${basePath}/${book.id}`}
                  interactive
                  className="block overflow-hidden rounded-lg border-0 p-0 shadow-page"
                >
                  <div
                    className="relative flex aspect-[2/3] flex-col justify-between p-md text-white"
                    style={{ backgroundColor: coverColor }}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-2"
                      style={{ backgroundColor: coverColor, filter: "brightness(0.65)" }}
                    />
                    <span className="relative self-start rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-bold">
                      {t("library.chapters", { count: book.chapter_count })}
                    </span>
                    <p className="relative text-card leading-snug font-extrabold drop-shadow-sm">
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
                href={`${basePath}/uncategorized`}
                interactive
                className="block overflow-hidden rounded-lg border-0 p-0 shadow-page"
              >
                <div className="relative flex aspect-[2/3] flex-col justify-between bg-muted p-md">
                  <div aria-hidden="true" className="absolute inset-y-0 left-0 w-2 bg-border" />
                  <span className="relative self-start rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                    {t("library.lessons", { count: uncategorizedLessons.length })}
                  </span>
                  <p className="relative text-card leading-snug font-extrabold text-muted-foreground">
                    {t("library.uncategorized")}
                  </p>
                </div>
              </Card>
            </li>
          )}
        </ul>
      )}

      {showAdminTools && (
        <form
          className="mt-2xl flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
          onSubmit={(event) => {
            event.preventDefault();
            setCreateError(null);
            createBookMutation.mutate();
          }}
        >
          <h2 className="label-caps">{t("library.newBook")}</h2>
          <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
            {t("library.bookTitle")}
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="field"
            />
          </label>
          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}
          <Button type="submit" disabled={createBookMutation.isPending} className="self-start">
            {createBookMutation.isPending ? t("library.creating") : t("library.createBook")}
          </Button>
        </form>
      )}
    </PageMain>
  );
}
