from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db
from app.plans.schemas import EntitlementResponse
from app.plans.service import list_entitlements

router = APIRouter(prefix="/v1", tags=["plans"])


@router.get("/me/entitlements", response_model=list[EntitlementResponse])
def read_my_entitlements(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EntitlementResponse]:
    entitlements = list_entitlements(db, user.id)
    return [EntitlementResponse.model_validate(e) for e in entitlements]
