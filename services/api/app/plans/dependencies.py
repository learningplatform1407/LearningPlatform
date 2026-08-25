from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.db.session import get_db
from app.plans.service import has_entitlement


def require_entitlement(feature_key: str) -> Callable[..., AuthenticatedUser]:
    def dependency(
        user: AuthenticatedUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AuthenticatedUser:
        if not has_entitlement(db, user.id, feature_key):
            raise ApiError(403, "forbidden", f"Missing entitlement: {feature_key}")
        return user

    return dependency
