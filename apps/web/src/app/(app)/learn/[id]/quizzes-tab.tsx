"use client";

import Link from "next/link";

import { QuestionBankList } from "@/components/question-bank-list";

export function QuizzesTab({ documentId }: { documentId: string }) {
  // Scoped by questions.document_id — a question's provenance, and the only
  // link between a lesson and a question. Lessons carry no tags of their
  // own, so "this lesson's questions" means exactly this.
  return (
    <div className="flex flex-col gap-md">
      <QuestionBankList
        filter={{ documentIds: [documentId] }}
        emptyMessage="No questions for this lesson yet."
      />
      <Link href="/exams" className="text-sm text-accent hover:underline">
        Practise in an exam →
      </Link>
    </div>
  );
}
