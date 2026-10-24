"use client";

import { useParams } from "next/navigation";

import { BookChaptersPage, UncategorizedLessonsPage } from "./book-content";

export default function BookPage() {
  const params = useParams<{ bookId: string }>();
  if (params.bookId === "uncategorized") {
    return <UncategorizedLessonsPage showAdminTools={false} />;
  }
  return <BookChaptersPage bookId={params.bookId} showAdminTools={false} />;
}
