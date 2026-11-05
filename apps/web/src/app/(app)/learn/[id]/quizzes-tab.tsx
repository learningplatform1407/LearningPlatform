"use client";

import Link from "next/link";

import { QuestionBankList, type SeeInLesson } from "@/components/question-bank-list";

export function QuizzesTab({
  documentId,
  onSeeInLesson,
}: {
  documentId: string;
  onSeeInLesson: SeeInLesson;
}) {
  // Scoped by questions.document_id — a question's provenance, and the only
  // link between a lesson and a question. Lessons carry no tags of their
  // own, so "this lesson's questions" means exactly this.
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <h2 className="text-heading leading-[1.25] font-extrabold">Questions in this lesson</h2>
        <Link
          href="/exams"
          className="rounded-full border border-border px-3 py-[5px] text-caption font-bold text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          Practise in an exam →
        </Link>
      </div>
      <QuestionBankList
        filter={{ documentIds: [documentId] }}
        emptyMessage="No questions for this lesson yet."
        onSeeInLesson={onSeeInLesson}
      />
    </div>
  );
}
