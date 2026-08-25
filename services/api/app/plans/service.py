from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.plans.constants import PLAN_ENTITLEMENTS
from app.plans.models import Subscription
from app.plans.schemas import EntitlementResponse


def get_active_subscription(db: Session, user_id: UUID) -> Subscription | None:
    return db.scalar(
        select(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
    )


def list_entitlements(db: Session, user_id: UUID) -> list[EntitlementResponse]:
    subscription = get_active_subscription(db, user_id)
    if subscription is None:
        return []
    features = PLAN_ENTITLEMENTS.get(subscription.plan_code, {})
    return [
        EntitlementResponse(feature_key=key, limit_value=limit) for key, limit in features.items()
    ]


def has_entitlement(db: Session, user_id: UUID, feature_key: str) -> bool:
    subscription = get_active_subscription(db, user_id)
    if subscription is None:
        return False
    return feature_key in PLAN_ENTITLEMENTS.get(subscription.plan_code, {})
