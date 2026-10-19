from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.admin import delete_auth_user
from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.cloze.schemas import ReviewSummaryResponse
from app.cloze.service import get_review_summary
from app.daily.dependencies import Clock, get_clock
from app.daily.service import get_streak_stats
from app.db.session import get_db
from app.documents.schemas import RecentLessonResponse
from app.documents.service import list_recent_lessons
from app.flashcards.router import read_flashcard_summary
from app.flashcards.schemas import FlashcardSummaryResponse
from app.progress.service import get_lesson_completion_totals, get_question_totals
from app.quizzes.service import get_exam_stats
from app.users.models import Profile
from app.users.schemas import (
    AccountSettingsResponse,
    MeResponse,
    ProfileStatsResponse,
    ProfileUpdateRequest,
)
from app.users.service import get_or_create_profile, update_profile


def _percent(numerator: int, denominator: int) -> float | None:
    return None if denominator == 0 else round(100 * numerator / denominator, 1)


router = APIRouter(prefix="/v1", tags=["users"])


def _to_me_response(profile: Profile, user: AuthenticatedUser) -> MeResponse:
    return MeResponse(
        id=profile.id,
        email=user.email,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        university=profile.university,
        role=profile.role,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        settings=AccountSettingsResponse.model_validate(profile.settings),
    )


@router.get("/me", response_model=MeResponse)
def read_me(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    profile = get_or_create_profile(db, user)
    return _to_me_response(profile, user)


@router.patch("/me", response_model=MeResponse)
def patch_me(
    data: ProfileUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    profile = get_or_create_profile(db, user)
    profile = update_profile(db, profile, data)
    return _to_me_response(profile, user)


@router.delete("/me", status_code=204)
def delete_me(user: AuthenticatedUser = Depends(get_current_user)) -> None:
    """Deletes the caller's account. No `db` dependency here on purpose --
    `delete_auth_user` removes the Supabase Auth user, and `profiles.id`'s
    CASCADE FK to `auth.users.id` does the rest at the database level, the
    same instant, with no separate app-side delete path to keep in sync."""
    delete_auth_user(user.id)


@router.get("/me/recent-lessons", response_model=list[RecentLessonResponse])
def read_recent_lessons(
    limit: int = 6,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecentLessonResponse]:
    rows = list_recent_lessons(db, user.id, limit)
    return [
        RecentLessonResponse(
            id=document.id,
            title=document.title,
            created_at=document.created_at,
            status=document.current_version.status if document.current_version else None,
            last_viewed_at=last_viewed_at,
        )
        for document, last_viewed_at in rows
    ]


@router.get("/me/review-summary", response_model=ReviewSummaryResponse)
def read_review_summary(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewSummaryResponse:
    return get_review_summary(db, user.id)


# Flashcards keep their own summary rather than folding into the one above:
# the two features have separate queues by design, and this one reports new
# counts alongside due counts. Registered here, not on the flashcards router,
# because it describes the caller rather than any one lesson.
router.get("/me/flashcard-summary", response_model=FlashcardSummaryResponse)(read_flashcard_summary)


@router.get("/me/stats", response_model=ProfileStatsResponse)
def read_my_stats(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> ProfileStatsResponse:
    """One round trip for the whole profile page — composes a small
    counting/summing function from each domain that tracks per-user
    activity, the same pattern /me/recent-lessons and /me/review-summary
    already use. No domain's own router carries this: it describes the
    caller across all of them, not any one feature."""
    current_streak_days, longest_streak_days = get_streak_stats(db, user.id, clock.today)
    lessons_completed, lessons_eligible = get_lesson_completion_totals(db, user.id)
    exam_stats = get_exam_stats(db, user.id)
    question_totals = get_question_totals(db, user.id)

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
