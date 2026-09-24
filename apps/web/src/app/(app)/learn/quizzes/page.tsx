"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { getBrowserApiClient } from "@/lib/api-client.browser";

export default function QuizzesPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const isAdmin = me.data?.role === "admin";

  return (
    <main className="p-xl">
      <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
        ← Learn
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Quizzes</h1>
      <p className="mt-md text-sm text-muted-foreground">Coming soon.</p>
      {isAdmin && (
        <Link
          href="/learn/quizzes/manage"
          className="mt-lg inline-block text-sm text-primary hover:underline"
        >
          Import questions →
        </Link>
      )}
    </main>
  );
}
