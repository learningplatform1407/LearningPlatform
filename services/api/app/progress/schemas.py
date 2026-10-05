from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class QuestionProgressSummary(BaseModel):
    """Where the caller currently stands on one question.

    Latest attempt only, matching `QuestionProgress` — so a question answered
    wrongly and then correctly reads `correct`. `attempt_count` is carried
    because "answered, on the fourth try" reads very differently from
    "answered first time" when deciding what to revise.
    """

    outcome: str
    points_awarded: int
    points_possible: int
    attempt_count: int
    last_answered_at: datetime


class BankTreeLesson(BaseModel):
    id: UUID
    title: str
    question_count: int
    answered_count: int
    # Outcome breakdown and points over the *answered* subset only — a
    # pending question contributes to question_count but to none of these.
    # Rates (success/failure/average score) are derived client-side from
    # these raw counts rather than sent pre-divided, so every caller handles
    # the "nothing answered yet" zero-division case the same way.
    correct_count: int
    partial_count: int
    incorrect_count: int
    points_awarded: int
    points_possible: int
    # Lesson-completion rollup (Library's progress bars). Shaped the same way
    # at every level of the tree — a lesson is just a one-lesson subtree of
    # itself — so `eligible_lesson_count`/`completed_lesson_count` are each
    # 0 or 1 here, and the sum of children at every container level below.
    # `eligible` excludes lessons with zero published questions from both the
    # numerator and denominator; `completed` is `success_rate >= threshold`,
    # the same ratio the Question Bank already derives, just thresholded.
    eligible_lesson_count: int
    completed_lesson_count: int


class BankTreeSubChapter(BaseModel):
    id: UUID
    title: str
    question_count: int
    answered_count: int
    correct_count: int
    partial_count: int
    incorrect_count: int
    points_awarded: int
    points_possible: int
    eligible_lesson_count: int
    completed_lesson_count: int
    lessons: list[BankTreeLesson]


class BankTreeChapter(BaseModel):
    id: UUID
    title: str
    question_count: int
    answered_count: int
    correct_count: int
    partial_count: int
    incorrect_count: int
    points_awarded: int
    points_possible: int
    eligible_lesson_count: int
    completed_lesson_count: int
    sub_chapters: list[BankTreeSubChapter]


class BankTreeBook(BaseModel):
    id: UUID
    title: str
    question_count: int
    answered_count: int
    correct_count: int
    partial_count: int
    incorrect_count: int
    points_awarded: int
    points_possible: int
    eligible_lesson_count: int
    completed_lesson_count: int
    chapters: list[BankTreeChapter]


class BankTreeResponse(BaseModel):
    """The whole content hierarchy with per-node question and progress
    counts, so the Question Bank renders the same shape as the lesson
    browser and shows what has been answered at every level.

    Counts roll upward: a chapter's totals are the sum of its sub-chapters'.
    Lessons with no sub-chapter live in `uncategorized_lessons`, matching how
    the rest of the app surfaces that bucket.
    """

    books: list[BankTreeBook]
    uncategorized_lessons: list[BankTreeLesson]
    # Questions whose document_id is NULL belong to no lesson, so they hang
    # under no node above. Counted separately or they would be invisible from
    # the bank entirely — and a bulk import with no document_id produces
    # exactly these.
    unassigned_question_count: int
    unassigned_answered_count: int
    unassigned_correct_count: int
    unassigned_partial_count: int
    unassigned_incorrect_count: int
    unassigned_points_awarded: int
    unassigned_points_possible: int
    # No eligible/completed-lesson pair here: these are questions with no
    # document_id at all, so there is no lesson to be "completed" — the
    # Library page (the only consumer of lesson-completion) never shows this
    # bucket in the first place, unlike the Question Bank page which does.
