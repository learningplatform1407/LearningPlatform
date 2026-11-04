"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";

/**
 * A directory of every admin content tool, each one linked out to where it
 * actually lives.
 *
 * Library authoring used to be inline on the regular Library pages, gated on
 * role -- but that put create/upload forms in front of every learner
 * browsing the same pages, admin or not. It now lives under `/admin/library`
 * instead, reusing the exact same browsing components (book grid, chapter
 * list, lesson list) via a `showAdminTools` flag, so there is still only one
 * copy of each form to maintain -- just reached from here rather than
 * surfaced to everyone.
 *
 * Mobile has no equivalent, which is the one intentional break in web/mobile
 * parity here: the two bulk importers, the question-of-the-day schedule, and
 * this `/admin/library` relocation are web-only by design -- mobile's
 * library screens still show admin forms inline.
 */
const TOOLS = [
  {
    href: "/admin/library",
    title: "Books, chapters and lectures",
    description:
      "Create books, chapters and sub-chapters, and upload lecture PDFs — browse the same tree learners see, with the admin forms included.",
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
  {
    href: "/admin/question-of-the-day",
    title: "Question of the day",
    description:
      "Plan which question each of the coming days gets, or redraw one. Days left alone draw at random when a learner first opens them.",
  },
] as const;

export default function AdminPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  if (me.isPending) {
    return (
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageMain>
    );
  }

  if (me.data?.role !== "admin") {
    return (
      <PageMain width="reading">
        <PageHeader kicker="Content tools" title="Admin" />
        <p className="mt-md text-sm font-medium text-muted-foreground">Admin access required.</p>
      </PageMain>
    );
  }

  return (
    <PageMain width="reading">
      <PageHeader kicker="Content tools" title="Admin" />
      <p className="text-toc text-muted-foreground">
        Content tools. Each one opens where that content actually lives.
      </p>

      <ul className="mt-lg border-t border-border">
        {TOOLS.map((tool) => (
          <li key={tool.href} className="border-b border-border">
            <Link
              href={tool.href}
              className="group -mx-sm block rounded-sm px-sm py-md hover:bg-muted"
            >
              <p className="text-card leading-snug font-extrabold text-foreground">
                {tool.title}{" "}
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
              </p>
              <p className="mt-xs text-toc leading-snug text-muted-foreground">
                {tool.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </PageMain>
  );
}
