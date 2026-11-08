"use client";

import Link from "next/link";

import { QuestionBankList, type SeeInLesson } from "@/components/question-bank-list";
import { useI18n } from "@/lib/i18n";

export function QuizzesTab({
  documentId,
  onSeeInLesson,
}: {
  documentId: string;
  onSeeInLesson: SeeInLesson;
}) {
  const { t } = useI18n();
  // Scoped by questions.document_id — a question's provenance, and the only
  // link between a lesson and a question. Lessons carry no tags of their
  // own, so "this lesson's questions" means exactly this.
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <h2 className="text-heading leading-[1.25] font-extrabold">
          {t("lesson.quizzes.heading")}
        </h2>
        <Link
          href="/exams"
          className="rounded-full border border-border px-3 py-[5px] text-caption font-bold text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          {t("lesson.quizzes.practise")}
        </Link>
      </div>
      <QuestionBankList
        filter={{ documentIds: [documentId] }}
        emptyMessage={t("bank.noLessonQuestions")}
        onSeeInLesson={onSeeInLesson}
      />
    </div>
  );
}
