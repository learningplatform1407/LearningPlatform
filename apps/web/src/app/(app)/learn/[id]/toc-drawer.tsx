"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

export interface TocHeading {
  id: string;
  label: string;
}

const LESSON_LINK =
  "block rounded-sm px-2 py-1.5 text-toc leading-[1.3] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-extrabold aria-[current=page]:text-foreground";

/**
 * The table of contents (design.md §6): a drawer that slides over the page
 * from the left edge, rather than a column that takes width from the
 * lesson.
 *
 * It shows the whole chapter the lesson belongs to: the chapter's title on
 * top, then each sub-chapter (bold, a step larger than its lessons) with its
 * lessons beneath, so the reader can move to any lesson in the chapter. The
 * lesson being read is marked, with its own headings nested under it.
 * Opening another lesson keeps the drawer open (`toc=1` on the link).
 *
 * The chapter comes from the content tree the Library and the Question Bank
 * already load -- one request for the whole hierarchy, shared through the
 * query cache -- rather than a list request per sub-chapter.
 */
export function TocDrawer({
  open,
  title,
  headings,
  activeHeadingId,
  onJump,
  chapter,
  currentDocumentId,
}: {
  open: boolean;
  /** The lesson's own title, for its headings when it has no chapter. */
  title: string;
  headings: TocHeading[];
  activeHeadingId: string | null;
  onJump: (headingId: string) => void;
  /** The lesson's chapter; null for a lesson outside the hierarchy. */
  chapter: { id: string; title: string } | null;
  currentDocumentId: string;
}) {
  const { t } = useI18n();
  const currentRef = useRef<HTMLLIElement>(null);
  // Open from the start means the reader came here from the contents: the
  // drawer was already on screen, so it stays put rather than sliding in
  // again. Closed once, it slides in as usual the next time.
  const [slideIn, setSlideIn] = useState(!open);
  if (!open && !slideIn) setSlideIn(true);

  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getBrowserApiClient().getQuestionBankTree(),
    enabled: open && chapter !== null,
  });
  // A lesson with no sub-chapter sits in the Uncategorized bucket.
  const uncategorized = useQuery({
    queryKey: ["documents", "none"],
    queryFn: () => getBrowserApiClient().listDocuments("none"),
    enabled: open && chapter === null,
  });

  const chapterNode = chapter
    ? tree.data?.books.flatMap((book) => book.chapters).find((node) => node.id === chapter.id)
    : undefined;

  // Opened on a long chapter, the lesson being read may be below the fold.
  const ready = chapterNode !== undefined || uncategorized.data !== undefined;
  useEffect(() => {
    if (open && ready) currentRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [open, ready]);

  if (!open) return null;

  const headingList = headings.length > 0 && (
    <ul className="mt-0.5 mb-1 ml-2 flex flex-col border-l border-border pl-1.5">
      {headings.map((heading) => (
        <li key={heading.id}>
          <button
            type="button"
            aria-current={heading.id === activeHeadingId ? "location" : undefined}
            onClick={() => onJump(heading.id)}
            className="w-full rounded-sm px-2 py-1 text-left text-caption leading-[1.3] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=location]:font-extrabold aria-[current=location]:text-foreground"
          >
            {heading.label}
          </button>
        </li>
      ))}
    </ul>
  );

  function lessonItem(lesson: { id: string; title: string }) {
    const current = lesson.id === currentDocumentId;
    return (
      <li key={lesson.id} ref={current ? currentRef : undefined}>
        <Link
          href={`/learn/${lesson.id}?toc=1`}
          aria-current={current ? "page" : undefined}
          className={LESSON_LINK}
        >
          {lesson.title}
        </Link>
        {current && headingList}
      </li>
    );
  }

  const loading = <p className="px-2 text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <nav
      data-no-swipe
      aria-label={t("lesson.toc.title")}
      className={`fixed top-0 bottom-0 left-0 z-[59] w-[280px] max-w-[85vw] ${slideIn ? "animate-[drawer-in-left_0.25s_ease]" : ""} motion-reduce:animate-none overflow-y-auto border-r border-border bg-background pt-[calc(22px+env(safe-area-inset-top,0px))] pr-3 pb-[22px] pl-3.5`}
    >
      {chapter ? (
        <>
          <p className="label-caps mb-1 ml-1.5">{t("lesson.toc.chapter")}</p>
          <h2 className="mb-md ml-1.5 text-[17px] leading-[1.25] font-extrabold text-foreground">
            {chapter.title}
          </h2>
          {tree.isPending && loading}
          {tree.isError && (
            <p role="alert" className="px-2 text-sm text-danger">
              {t("lesson.toc.loadFailed")}
            </p>
          )}
          {chapterNode?.sub_chapters.map((subChapter) => (
            <section key={subChapter.id} className="mb-md">
              <h3 className="mb-1 ml-1.5 text-[15px] leading-[1.3] font-extrabold text-foreground">
                {subChapter.title}
              </h3>
              {subChapter.lessons.length > 0 ? (
                <ul className="flex flex-col">{subChapter.lessons.map(lessonItem)}</ul>
              ) : (
                <p className="px-2 text-sm text-muted-foreground">{t("bank.noLessons")}</p>
              )}
            </section>
          ))}
        </>
      ) : (
        <>
          {headings.length > 0 && (
            <section className="mb-lg">
              <h2 className="label-caps mb-3 ml-1.5">{title}</h2>
              {headingList}
            </section>
          )}
          <section>
            <h2 className="label-caps mb-3 ml-1.5">{t("lesson.toc.lessonsInChapter")}</h2>
            {uncategorized.isPending && loading}
            {uncategorized.data && uncategorized.data.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">{t("bank.noLessons")}</p>
            )}
            {uncategorized.data && uncategorized.data.length > 0 && (
              <ul className="flex flex-col">{uncategorized.data.map(lessonItem)}</ul>
            )}
          </section>
        </>
      )}
    </nav>
  );
}
