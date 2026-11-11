import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.daily.service import get_streak_stats
from app.progress.service import get_lesson_completion_totals, get_question_totals
from app.quizzes.service import get_exam_stats
from app.users.schemas import ProfileStatsResponse


def _percent(numerator: int, denominator: int) -> float | None:
    return None if denominator == 0 else round(100 * numerator / denominator, 1)


def build_profile_stats(db: Session, user_id: uuid.UUID, today: date) -> ProfileStatsResponse:
    """One round trip for a whole profile page, the caller's own or a public
    one -- composes a small counting/summing function from each domain that
    tracks per-user activity, the same pattern /me/recent-lessons and
    /me/review-summary already use. No domain's own module carries this: it
    describes a learner across all of them, not any one feature."""
    current_streak_days, longest_streak_days = get_streak_stats(db, user_id, today)
    lessons_completed, lessons_eligible = get_lesson_completion_totals(db, user_id)
    exam_stats = get_exam_stats(db, user_id)
    question_totals = get_question_totals(db, user_id)

    return ProfileStatsResponse(
        current_streak_days=current_streak_days,
        longest_streak_days=longest_streak_days,
        lessons_completed=lessons_completed,
        lessons_eligible=lessons_eligible,
        exams_completed=exam_stats.completed_count,
        exam_average_score_percent=_percent(exam_stats.points_awarded, exam_stats.points_possible),
        questions_attempted=question_totals.attempted,
        questions_answered_lifetime=question_totals.lifetime_answers,
        question_accuracy_percent=_percent(question_totals.correct, question_totals.attempted),
    )
