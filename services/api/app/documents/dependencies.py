from fastapi import Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.db.session import get_db
from app.users.constants import Role
from app.users.service import get_or_create_profile


def require_admin(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    profile = get_or_create_profile(db, user)
    if profile.role != Role.ADMIN:
        raise ApiError(403, "forbidden", "Admin access required")
    return user
