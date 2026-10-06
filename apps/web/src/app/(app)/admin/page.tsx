"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { getBrowserApiClient } from "@/lib/api-client.browser";

/**
 * A directory, deliberately not a console.
 *
 * Every tool below is linked, never re-implemented here. Authoring stays
 * where the content lives — you add a chapter inside the book you are
 * looking at, and upload a lecture inside its chapter — which means the
 * parent is always already chosen and cannot be mis-picked, and there is
 * only one copy of each form to maintain. What was actually missing was
 * discoverability: each tool used to hide in a corner of a different
 * learner page.
 *
 * Mobile has no equivalent, which is the one intentional break in web/mobile
 * parity here: two of the three tools are web-only bulk importers, and
 * library authoring mobile already has inline.
 */
const TOOLS = [
  {
    href: "/learn/library",
    title: "Books, chapters and lectures",
    description:
      "Create books, chapters and sub-chapters, and upload lecture PDFs — inline on the Library page, inside whichever book you are viewing.",
  },
  {
    href: "/question-bank/manage",
    title: "Import questions",
    description:
      "Bulk JSON import with a dry-run preview. Idempotent on external_id, so re-importing updates rather than duplicating.",
  },
  {
    href: "/learn/flashcards/manage",
    title: "Import flashcards",
    description:
      "Bulk JSON import of official cards, bound to a lesson. Same dry-run-then-commit flow as questions.",
  },
] as const;

export default function AdminPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  if (me.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (me.data?.role !== "admin") {
    return (
      <main className="p-xl">
        <h1 className="text-2xl font-semibold text-foreground">Admin</h1>
        <p className="mt-md text-sm text-muted-foreground">Admin access required.</p>
      </main>
    );
  }

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Admin</h1>
      <p className="mt-xs text-sm text-muted-foreground">
        Content tools. Each one opens where that content actually lives.
      </p>

      <ul className="mt-lg flex w-full max-w-[48rem] flex-col gap-sm">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="block rounded-md border border-border p-lg hover:bg-muted"
            >
              <p className="text-lg font-semibold text-foreground">{tool.title}</p>
              <p className="mt-xs text-sm text-muted-foreground">{tool.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
