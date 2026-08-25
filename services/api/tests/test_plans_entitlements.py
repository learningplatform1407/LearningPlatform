import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.plans.constants import PLAN_ENTITLEMENTS, PlanCode
from app.plans.dependencies import require_entitlement
from app.plans.models import Subscription


def test_entitlements_empty_for_user_without_subscription(authed_client: TestClient) -> None:
    response = authed_client.get("/v1/me/entitlements")
    assert response.status_code == 200
    assert response.json() == []


def test_entitlements_lists_active_plan_features(
    authed_client: TestClient,
    authenticated_user: AuthenticatedUser,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(PLAN_ENTITLEMENTS, PlanCode.FREE, {"notes.create": None})
    db_session.add(
        Subscription(user_id=authenticated_user.id, plan_code=PlanCode.FREE, status="active")
    )
    db_session.commit()

    response = authed_client.get("/v1/me/entitlements")
    assert response.status_code == 200
    assert response.json() == [{"feature_key": "notes.create", "limit_value": None}]


def test_require_entitlement_forbidden_without_subscription(
    authenticated_user: AuthenticatedUser, db_session: Session
) -> None:
    dependency = require_entitlement("pro.feature")
    with pytest.raises(ApiError) as exc_info:
        dependency(user=authenticated_user, db=db_session)
    assert exc_info.value.status_code == 403


def test_require_entitlement_passes_when_granted(
    authenticated_user: AuthenticatedUser,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(PLAN_ENTITLEMENTS, PlanCode.PRO, {"pro.feature": None})
    db_session.add(
        Subscription(user_id=authenticated_user.id, plan_code=PlanCode.PRO, status="active")
    )
    db_session.commit()

    dependency = require_entitlement("pro.feature")
    result = dependency(user=authenticated_user, db=db_session)
    assert result == authenticated_user
