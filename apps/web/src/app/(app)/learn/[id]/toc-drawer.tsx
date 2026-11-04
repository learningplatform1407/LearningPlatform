"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { getBrowserApiClient } from "@/lib/api-client.browser";

export interface TocHeading {
  id: string;
  label: string;
}

/**
 * The table of contents (design.md §6): a drawer that slides over the page
 * from the left edge, rather than a column that takes width from the
 * lesson. Two sections -- the headings inside this lesson (with the one
 * you're reading marked), then the other lessons of this sub-chapter.
 */
export function TocDrawer({
  open,
  title,
  headings,
  activeHeadingId,
  onJump,
  scopeId,
  currentDocumentId,
}: {
  open: boolean;
  title: string;
  headings: TocHeading[];
  activeHeadingId: string | null;
  onJump: (headingId: string) => void;
  scopeId: string;
  currentDocumentId: string;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["documents", scopeId],
    queryFn: () => getBrowserApiClient().listDocuments(scopeId),
    enabled: open,
  });

  if (!open) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="fixed top-0 bottom-0 left-0 z-[59] w-[280px] max-w-[85vw] animate-[drawer-in-left_0.25s_ease] overflow-y-auto border-r border-border bg-background pt-[calc(22px+env(safe-area-inset-top,0px))] pr-3 pb-[22px] pl-3.5"
    >
      {headings.length > 0 && (
        <section className="mb-lg">
          <h2 className="label-caps mb-3 ml-1.5">{title}</h2>
          <ul className="flex flex-col">
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  type="button"
                  aria-current={heading.id === activeHeadingId ? "location" : undefined}
                  onClick={() => onJump(heading.id)}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-toc leading-[1.3] font-semibold text-foreground hover:bg-muted aria-[current=location]:bg-muted aria-[current=location]:font-extrabold"
                >
                  {heading.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="label-caps mb-3 ml-1.5">Lessons in this chapter</h2>
        {isPending && <p className="px-2 text-sm text-muted-foreground">Loading...</p>}
        {!isPending && (!data || data.length === 0) && (
          <p className="px-2 text-sm text-muted-foreground">No lessons.</p>
        )}
        {data && data.length > 0 && (
          <ul className="flex flex-col">
            {data.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/learn/${doc.id}`}
                  aria-current={doc.id === currentDocumentId ? "page" : undefined}
                  className="block rounded-sm px-2 py-1.5 text-toc leading-[1.3] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-extrabold aria-[current=page]:text-foreground"
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </nav>
  );
}
