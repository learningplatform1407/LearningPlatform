from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.activity.constants import ActivityKind
from app.activity.recording import record_event
from app.challenges.constants import ChallengeStatus
from app.challenges.models import Challenge
from app.quizzes.constants import SessionStatus
from app.quizzes.models import QuizSession

# Called from quizzes' _finalize, so like app/activity/recording.py it imports
# models only: app/challenges/service.py imports the quiz service itself.


def score_percent(session: QuizSession | None) -> float | None:
    if session is None or not session.points_possible:
        return None
    return round(100 * (session.points_awarded or 0) / session.points_possible, 1)


def on_session_finished(db: Session, session: QuizSession, *, now: datetime) -> None:
    """Ends the challenge this session was answering, if any. Cancelling it
    counts as declining: the challenger is told it's over, with no score."""
    challenge = db.scalar(
        select(Challenge).where(
            Challenge.challengee_session_id == session.id,
            Challenge.status == ChallengeStatus.ACCEPTED,
        )
    )
    if challenge is None:
        return
    challenge.completed_at = now
    if session.status == SessionStatus.CANCELLED:
        challenge.status = ChallengeStatus.DECLINED
        return
    challenge.status = ChallengeStatus.COMPLETED

    source = db.get(QuizSession, challenge.source_session_id)
    scores = {
        challenge.challenger_id: score_percent(source),
        challenge.challengee_id: score_percent(session),
    }
    for user_id, opponent_id in (
        (challenge.challenger_id, challenge.challengee_id),
        (challenge.challengee_id, challenge.challenger_id),
    ):
        record_event(
            db,
            user_id=user_id,
            kind=ActivityKind.CHALLENGE_COMPLETED,
            now=now,
            subject_id=challenge.id,
            payload={
                "opponent_id": str(opponent_id),
                "score_percent": scores[user_id],
                "opponent_score_percent": scores[opponent_id],
            },
        )
