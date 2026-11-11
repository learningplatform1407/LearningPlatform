import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.activity.constants import ActivityKind
from app.activity.models import ActivityEvent
from app.activity.schemas import ActivityActorResponse, ActivityEventResponse
from app.documents.models import Document
from app.social.models import Follow
from app.social.service import get_visible_profile
from app.social.visibility import is_public
from app.users.models import Profile


def _page(
    db: Session, stmt: Select[tuple[ActivityEvent]], *, before: datetime | None, limit: int
) -> Sequence[ActivityEvent]:
    if before is not None:
        stmt = stmt.where(ActivityEvent.created_at < before)
    return db.scalars(
        stmt.order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc()).limit(limit)
    ).all()


def _to_responses(db: Session, events: Sequence[ActivityEvent]) -> list[ActivityEventResponse]:
    """Two lookups for the whole page: who did it, and the lesson titles.
    An event whose lesson has since been deleted is dropped."""
    user_ids = {event.user_id for event in events}
    actors = {
        profile.id: profile
        for profile in db.scalars(select(Profile).where(Profile.id.in_(user_ids)))
    }
    document_ids = {
        event.subject_id
        for event in events
        if event.kind == ActivityKind.LESSON_COMPLETED and event.subject_id is not None
    }
    titles = (
        dict(
            db.execute(select(Document.id, Document.title).where(Document.id.in_(document_ids)))
            .tuples()
            .all()
        )
        if document_ids
        else {}
    )

    responses: list[ActivityEventResponse] = []
    for event in events:
        actor = actors[event.user_id]
        response = ActivityEventResponse(
            id=event.id,
            kind=ActivityKind(event.kind),
            created_at=event.created_at,
            user=ActivityActorResponse(
                id=actor.id, display_name=actor.display_name, avatar_url=actor.avatar_url
            ),
        )
        if event.kind == ActivityKind.LESSON_COMPLETED:
            if event.subject_id not in titles:
                continue
            response.document_id = event.subject_id
            response.document_title = titles[event.subject_id]
        elif event.kind == ActivityKind.EXAM_COMPLETED:
            response.score_percent = event.payload.get("score_percent")
            response.question_count = event.payload.get("question_count")
        elif event.kind == ActivityKind.STREAK_MILESTONE:
            response.streak_days = event.payload.get("days")
        responses.append(response)
    return responses


def list_following_activity(
    db: Session, viewer_id: uuid.UUID, *, before: datetime | None, limit: int
) -> list[ActivityEventResponse]:
    """The people the caller follows, newest first, only while they're public."""
    stmt = (
        select(ActivityEvent)
        .join(Follow, Follow.followee_id == ActivityEvent.user_id)
        .where(Follow.follower_id == viewer_id, is_public(ActivityEvent.user_id))
    )
    return _to_responses(db, _page(db, stmt, before=before, limit=limit))


def list_user_activity(
    db: Session,
    viewer_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    before: datetime | None,
    limit: int,
) -> list[ActivityEventResponse]:
    """One learner's own events, with the same visibility as their profile."""
    get_visible_profile(db, viewer_id, user_id)
    stmt = select(ActivityEvent).where(ActivityEvent.user_id == user_id)
    return _to_responses(db, _page(db, stmt, before=before, limit=limit))
