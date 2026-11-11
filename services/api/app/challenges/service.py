import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.activity.schemas import ActivityActorResponse
from app.challenges.completion import score_percent
from app.challenges.constants import CHALLENGE_TTL, MAX_CHALLENGES_LISTED, ChallengeStatus
from app.challenges.models import Challenge
from app.challenges.schemas import (
    ChallengeCreateRequest,
    ChallengeQuestionResult,
    ChallengeResponse,
)
from app.common.errors import ApiError
from app.quizzes.constants import TERMINAL_STATUSES, SessionStatus
from app.quizzes.models import QuizSession, QuizSessionQuestion
from app.quizzes.schemas import QuizSessionResponse
from app.quizzes.service import create_session_from_questions, expire_open_session, get_session
from app.social.models import Follow
from app.users.models import Profile


def _not_found() -> ApiError:
    return ApiError(404, "challenge_not_found", "Challenge not found")


def _is_public(db: Session, user_id: uuid.UUID) -> bool:
    profile = db.get(Profile, user_id)
    return profile is not None and profile.settings.profile_public


def _are_mutual(db: Session, a: uuid.UUID, b: uuid.UUID) -> bool:
    """Both public and following each other -- the only pair that can
    challenge, so nobody receives one from a stranger."""
    if not (_is_public(db, a) and _is_public(db, b)):
        return False
    return db.get(Follow, (a, b)) is not None and db.get(Follow, (b, a)) is not None


def _refresh_status(challenge: Challenge, now: datetime) -> None:
    """Lazy expiry, like quiz sessions: a pending challenge past its date is
    expired the next time anyone looks."""
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:  # SQLite hands back naive datetimes
        expires_at = expires_at.replace(tzinfo=UTC)
    if challenge.status == ChallengeStatus.PENDING and expires_at <= now:
        challenge.status = ChallengeStatus.EXPIRED


def _get_participating(db: Session, challenge_id: uuid.UUID, user_id: uuid.UUID) -> Challenge:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None or user_id not in (challenge.challenger_id, challenge.challengee_id):
        raise _not_found()
    return challenge


def _outcomes(db: Session, session_id: uuid.UUID | None) -> dict[int, str | None]:
    if session_id is None:
        return {}
    return {
        position: outcome
        for position, outcome in db.execute(
            select(QuizSessionQuestion.position, QuizSessionQuestion.outcome).where(
                QuizSessionQuestion.session_id == session_id
            )
        ).tuples()
    }


def _to_response(db: Session, challenge: Challenge, viewer_id: uuid.UUID) -> ChallengeResponse:
    incoming = viewer_id == challenge.challengee_id
    opponent_id = challenge.challenger_id if incoming else challenge.challengee_id
    opponent = db.get(Profile, opponent_id)
    assert opponent is not None  # CASCADE removes the challenge with either profile

    source = db.get(QuizSession, challenge.source_session_id)
    assert source is not None  # CASCADE, as above
    answer = (
        db.get(QuizSession, challenge.challengee_session_id)
        if challenge.challengee_session_id
        else None
    )
    mine, theirs = (answer, source) if incoming else (source, answer)
    completed = challenge.status == ChallengeStatus.COMPLETED
    mine_finished = mine is not None and mine.status in TERMINAL_STATUSES

    questions = None
    if completed and mine is not None and theirs is not None:
        my_outcomes = _outcomes(db, mine.id)
        their_outcomes = _outcomes(db, theirs.id)
        questions = [
            ChallengeQuestionResult(
                position=position,
                your_outcome=my_outcomes.get(position),
                opponent_outcome=their_outcomes.get(position),
            )
            for position in range(source.question_count)
        ]

    return ChallengeResponse(
        id=challenge.id,
        status=ChallengeStatus(challenge.status),
        direction="incoming" if incoming else "sent",
        opponent=ActivityActorResponse(
            id=opponent.id, display_name=opponent.display_name, avatar_url=opponent.avatar_url
        ),
        question_count=source.question_count,
        duration_seconds=source.duration_seconds,
        created_at=challenge.created_at,
        expires_at=challenge.expires_at,
        completed_at=challenge.completed_at,
        your_session_id=mine.id if mine is not None else None,
        your_score_percent=score_percent(mine) if mine_finished else None,
        opponent_score_percent=score_percent(theirs) if completed else None,
        questions=questions,
    )


def create_challenge(
    db: Session, challenger_id: uuid.UUID, data: ChallengeCreateRequest
) -> ChallengeResponse:
    if data.user_id == challenger_id:
        raise ApiError(400, "cannot_challenge_self", "You can't challenge yourself")
    source = db.get(QuizSession, data.session_id)
    if source is None or source.user_id != challenger_id:
        raise ApiError(404, "not_found", "Quiz session not found")
    # Expired sessions were graded too; only a cancelled one has no score to beat.
    if source.status not in (SessionStatus.COMPLETED, SessionStatus.EXPIRED):
        raise ApiError(409, "session_not_finished", "Finish the exam before sending it")
    if not _are_mutual(db, challenger_id, data.user_id):
        raise ApiError(
            403, "not_mutual_follow", "You can only challenge people who follow you back"
        )

    now = datetime.now(UTC)
    challenge = Challenge(
        challenger_id=challenger_id,
        challengee_id=data.user_id,
        source_session_id=source.id,
        status=ChallengeStatus.PENDING,
        created_at=now,
        expires_at=now + CHALLENGE_TTL,
    )
    db.add(challenge)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ApiError(
            409, "already_challenged", "You already sent this exam to this person"
        ) from exc
    return _to_response(db, challenge, challenger_id)


def list_challenges(db: Session, user_id: uuid.UUID) -> list[ChallengeResponse]:
    now = datetime.now(UTC)
    challenges = db.scalars(
        select(Challenge)
        .where(or_(Challenge.challenger_id == user_id, Challenge.challengee_id == user_id))
        .order_by(Challenge.created_at.desc(), Challenge.id)
        .limit(MAX_CHALLENGES_LISTED)
    ).all()
    for challenge in challenges:
        _refresh_status(challenge, now)
    db.commit()
    return [_to_response(db, challenge, user_id) for challenge in challenges]


def get_challenge(db: Session, challenge_id: uuid.UUID, user_id: uuid.UUID) -> ChallengeResponse:
    challenge = _get_participating(db, challenge_id, user_id)
    _refresh_status(challenge, datetime.now(UTC))
    db.commit()
    return _to_response(db, challenge, user_id)


def _get_pending_incoming(
    db: Session, challenge_id: uuid.UUID, user_id: uuid.UUID, now: datetime
) -> Challenge:
    challenge = _get_participating(db, challenge_id, user_id)
    if challenge.challengee_id != user_id:
        raise _not_found()
    _refresh_status(challenge, now)
    if challenge.status != ChallengeStatus.PENDING:
        db.commit()
        raise ApiError(409, "challenge_not_pending", "This challenge can no longer be answered")
    return challenge


def accept_challenge(
    db: Session, challenge_id: uuid.UUID, user_id: uuid.UUID
) -> QuizSessionResponse:
    """Starts the challengee's attempt: the challenger's questions, in their
    order, with their timer and reveal mode."""
    now = datetime.now(UTC)
    challenge = _get_pending_incoming(db, challenge_id, user_id, now)
    source = db.get(QuizSession, challenge.source_session_id)
    assert source is not None
    draw = sorted(source.questions, key=lambda question: question.position)

    expire_open_session(db, user_id, now=now)
    challenge.status = ChallengeStatus.ACCEPTED
    # Rolled back with the challenge's new status if another session is open.
    session = create_session_from_questions(
        db,
        user_id,
        question_ids=[question.question_id for question in draw],
        scoring_schemes=[question.scoring_scheme for question in draw],
        reveal_mode=source.reveal_mode,
        duration_seconds=source.duration_seconds,
        filter_spec={"challenge_id": str(challenge.id)},
        now=now,
    )
    challenge.challengee_session_id = session.id
    db.commit()
    return get_session(db, session.id, user_id)


def decline_challenge(
    db: Session, challenge_id: uuid.UUID, user_id: uuid.UUID
) -> ChallengeResponse:
    now = datetime.now(UTC)
    challenge = _get_pending_incoming(db, challenge_id, user_id, now)
    challenge.status = ChallengeStatus.DECLINED
    challenge.completed_at = now
    db.commit()
    return _to_response(db, challenge, user_id)
