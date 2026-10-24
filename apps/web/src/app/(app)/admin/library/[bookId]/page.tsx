"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import {
  BookChaptersPage,
  UncategorizedLessonsPage,
} from "@/app/(app)/learn/library/[bookId]/book-content";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";

export default function AdminBookPage() {
  const params = useParams<{ bookId: string }>();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  if (me.isPending) {
    return (
      <PageMain>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageMain>
    );
  }

  if (me.data?.role !== "admin") {
    return (
      <PageMain>
        <h1 className="text-2xl font-bold text-foreground">Library</h1>
        <p className="mt-md text-sm font-medium text-muted-foreground">Admin access required.</p>
      </PageMain>
    );
  }

  if (params.bookId === "uncategorized") {
    return <UncategorizedLessonsPage showAdminTools />;
  }
  return <BookChaptersPage bookId={params.bookId} showAdminTools />;
}
